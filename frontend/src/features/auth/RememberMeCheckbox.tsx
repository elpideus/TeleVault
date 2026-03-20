// src/features/auth/RememberMeCheckbox.tsx
import { Checkbox } from "../../themes/index";

export interface RememberMeCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function RememberMeCheckbox({ checked, onChange }: RememberMeCheckboxProps) {
  return <Checkbox checked={checked} onChange={onChange} label="Stay signed in" />;
}
