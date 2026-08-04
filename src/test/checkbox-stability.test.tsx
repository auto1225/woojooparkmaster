import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Checkbox } from "@/components/ui/checkbox";

function StableCheckbox() {
  const [checked, setChecked] = useState(false);
  return <Checkbox aria-label="보고 항목 포함" checked={checked} onCheckedChange={value => setChecked(Boolean(value))} />;
}

describe("Checkbox visual stability", () => {
  it("keeps keyboard focus decoration inside its fixed box while toggling", () => {
    render(<StableCheckbox />);
    const checkbox = screen.getByRole("checkbox", { name: "보고 항목 포함" });

    expect(checkbox.className).toContain("h-4");
    expect(checkbox.className).toContain("w-4");
    expect(checkbox.className).toContain("focus-visible:ring-inset");
    expect(checkbox.className).toContain("focus-visible:ring-offset-0");

    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute("data-state", "checked");
    expect(checkbox.className).toContain("h-4");
    expect(checkbox.className).toContain("w-4");
  });

  it("renders an explicit minus state for partial selections", () => {
    const { container } = render(<Checkbox aria-label="부분 선택" checked="indeterminate" />);
    const checkbox = screen.getByRole("checkbox", { name: "부분 선택" });
    const icons = container.querySelectorAll("svg");

    expect(checkbox).toHaveAttribute("data-state", "indeterminate");
    expect(checkbox.className).toContain("data-[state=indeterminate]:bg-primary");
    expect(icons).toHaveLength(2);
    expect(icons[0].getAttribute("class")).toContain("group-data-[state=indeterminate]:hidden");
    expect(icons[1].getAttribute("class")).toContain("group-data-[state=indeterminate]:block");
  });
});
