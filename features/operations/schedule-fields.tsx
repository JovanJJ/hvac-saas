"use client";
import { useId } from "react";
import { FormField } from "@/components/ui/form-field";
export function ScheduleFields({
  members,
  start = "",
  end = "",
}: {
  members: { id: string; label: string }[];
  start?: string;
  end?: string;
}) {
  const id = useId();
  return (
    <>
      <FormField
        id={`${id}-start`}
        name="start"
        label="Početak"
        type="datetime-local"
        defaultValue={start}
        required
      />
      <FormField
        id={`${id}-end`}
        name="end"
        label="Završetak"
        type="datetime-local"
        defaultValue={end}
        required
      />
      <fieldset>
        <legend>Dodeljeni članovi tima</legend>
        {members.map((member) => (
          <label key={member.id} className="flex items-center gap-3 break-all">
            <input
              className="w-5"
              type="checkbox"
              name="members"
              value={member.id}
            />
            {member.label}
          </label>
        ))}
      </fieldset>
    </>
  );
}
