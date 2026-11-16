import { useId, type SelectHTMLAttributes } from "react";
export function SelectField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <div className="my-4 min-w-0">
      <label htmlFor={id} className="mb-2 text-sm font-semibold">
        {label}
      </label>
      <select {...props} id={id}>
        {children}
      </select>
    </div>
  );
}
