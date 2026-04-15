const crypto = require("crypto");
const { pgPool } = require("../../db/postgres");

let memoryUserId = 1;
const memoryUsers = [];
const memorySessions = [];
const PG_FALLBACK_TIMEOUT_MS = 1200;

function pgQueryWithTimeout(query, params) {
  return Promise.race([
    pgPool.query(query, params),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("PG_TIMEOUT")), PG_FALLBACK_TIMEOUT_MS);
    })
  ]);
}

class AuthRepository {
  async createUser({ name, email, passwordHash, passwordSalt }) {
    try {
      const query = `
        INSERT INTO users (name, email, password_hash, password_salt)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, email, created_at AS "createdAt"
      `;
      const { rows } = await pgQueryWithTimeout(query, [name, email, passwordHash, passwordSalt]);
      return rows[0];
    } catch (error) {
      const user = {
        id: memoryUserId++,
        name: name || "User",
        email,
        passwordHash,
        passwordSalt,
        createdAt: new Date().toISOString()
      };
      memoryUsers.push(user);
      return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
    }
  }

  async findUserByEmail(email) {
    try {
      const query = `
        SELECT id, name, email, password_hash AS "passwordHash", password_salt AS "passwordSalt"
        FROM users
        WHERE email = $1
        LIMIT 1
      `;
      const { rows } = await pgQueryWithTimeout(query, [email]);
      return rows[0] || null;
    } catch (error) {
      const user = memoryUsers.find((item) => item.email === email);
      if (!user) return null;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        passwordSalt: user.passwordSalt
      };
    }
  }

  async findUserById(userId) {
    const query = `
      SELECT id, name, email, created_at AS "createdAt"
      FROM users
      WHERE id = $1
      LIMIT 1
    `;
    try {
      const { rows } = await pgQueryWithTimeout(query, [userId]);
      return rows[0] || null;
    } catch (error) {
      const user = memoryUsers.find((item) => item.id === userId);
      if (!user) return null;
      return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
    }
  }

  async createSession(userId, ttlHours) {
    const token = crypto.randomBytes(32).toString("hex");
    try {
      const query = `
        INSERT INTO user_sessions (user_id, token, expires_at)
        VALUES ($1, $2, NOW() + ($3::text || ' hours')::interval)
        RETURNING token, expires_at AS "expiresAt"
      `;
      const { rows } = await pgQueryWithTimeout(query, [userId, token, ttlHours]);
      return rows[0];
    } catch (error) {
      const expiresAt = new Date(Date.now() + Number(ttlHours) * 60 * 60 * 1000).toISOString();
      memorySessions.push({ userId, token, expiresAt });
      return { token, expiresAt };
    }
  }

  async findSessionWithUser(token) {
    try {
      const query = `
        SELECT
          u.id,
          u.name,
          u.email,
          u.created_at AS "createdAt",
          s.expires_at AS "expiresAt"
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = $1 AND s.expires_at > NOW()
        LIMIT 1
      `;
      const { rows } = await pgQueryWithTimeout(query, [token]);
      return rows[0] || null;
    } catch (error) {
      const session = memorySessions.find(
        (item) => item.token === token && new Date(item.expiresAt).getTime() > Date.now()
      );
      if (!session) return null;
      const user = memoryUsers.find((item) => item.id === session.userId);
      if (!user) return null;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        expiresAt: session.expiresAt
      };
    }
  }
}

module.exports = new AuthRepository();
