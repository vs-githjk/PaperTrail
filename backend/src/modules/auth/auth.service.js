const crypto = require("crypto");
const config = require("../../config");
const authRepository = require("./auth.repository");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

class AuthService {
  async signup({ name, email, password }) {
    const normalizedName = String(name || "").trim();
    const normalizedEmail = normalizeEmail(email);
    const normalizedPassword = String(password || "");

    if (!normalizedName) {
      const error = new Error("Name is required.");
      error.status = 400;
      throw error;
    }

    if (!normalizedEmail) {
      const error = new Error("Email is required.");
      error.status = 400;
      throw error;
    }

    if (normalizedPassword.length < 8) {
      const error = new Error("Password must be at least 8 characters long.");
      error.status = 400;
      throw error;
    }

    const existing = await authRepository.findUserByEmail(normalizedEmail);
    if (existing) {
      const error = new Error("An account with this email already exists.");
      error.status = 409;
      throw error;
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(normalizedPassword, salt);
    const user = await authRepository.createUser({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
      passwordSalt: salt
    });
    const session = await authRepository.createSession(user.id, config.auth.sessionTtlHours);
    return { user, token: session.token, expiresAt: session.expiresAt };
  }

  async login({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedPassword = String(password || "");

    if (!normalizedEmail || !normalizedPassword) {
      const error = new Error("Email and password are required.");
      error.status = 400;
      throw error;
    }

    const user = await authRepository.findUserByEmail(normalizedEmail);
    if (!user) {
      const error = new Error("Invalid email or password.");
      error.status = 401;
      throw error;
    }

    const computedHash = hashPassword(normalizedPassword, user.passwordSalt);
    const inputHashBuffer = Buffer.from(computedHash, "hex");
    const storedHashBuffer = Buffer.from(user.passwordHash, "hex");
    const isValid = inputHashBuffer.length === storedHashBuffer.length
      && crypto.timingSafeEqual(inputHashBuffer, storedHashBuffer);

    if (!isValid) {
      const error = new Error("Invalid email or password.");
      error.status = 401;
      throw error;
    }

    const session = await authRepository.createSession(user.id, config.auth.sessionTtlHours);
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      token: session.token,
      expiresAt: session.expiresAt
    };
  }

  async getUserForToken(token) {
    if (!token) return null;
    try {
      return await authRepository.findSessionWithUser(token);
    } catch (error) {
      return null;
    }
  }
}

module.exports = new AuthService();
