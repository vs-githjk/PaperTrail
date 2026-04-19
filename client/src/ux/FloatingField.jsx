export function FloatingField({
  id,
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  ariaLabel,
  name,
  className = "",
  inputClassName = ""
}) {
  const filled = Boolean(String(value || "").trim());

  return (
    <div className={`ux-float-field${filled ? " ux-float-filled" : ""}${className ? ` ${className}` : ""}`}>
      <input
        id={id}
        name={name}
        className={`ux-float-input${inputClassName ? ` ${inputClassName}` : ""}`}
        type={type}
        value={value}
        onChange={onChange}
        placeholder=" "
        autoComplete={autoComplete}
        aria-label={ariaLabel || label}
      />
      <label className="ux-float-label" htmlFor={id}>
        {label}
      </label>
      <span className="ux-focus-beam" aria-hidden="true" />
    </div>
  );
}
