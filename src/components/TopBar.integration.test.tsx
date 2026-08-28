import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ToolMode } from "../types";
import { TopBar } from "./TopBar";

const TOOL_LABELS = ["Select", "Wall", "Room", "Line", "Rect", "Calibrate"];

function renderTopBar(
  overrides: Partial<Parameters<typeof TopBar>[0]> = {},
) {
  const onToolModeChange = vi.fn();
  const view = render(
    <TopBar
      unitSystem="imperial"
      toolMode="select"
      hasPlan
      hasImage
      pixelsPerInch={10}
      hasWalls
      imageUnderlayVisible
      isConverting={false}
      activePlanName="Studio"
      isDirty={false}
      onUnitSystemChange={vi.fn()}
      onUpload={vi.fn()}
      onDrawPlan={vi.fn()}
      onToolModeChange={onToolModeChange}
      onConvert={vi.fn()}
      onToggleUnderlay={vi.fn()}
      onSave={vi.fn()}
      onSaveAs={vi.fn()}
      onSaveCleanAs={vi.fn()}
      onOpen={vi.fn()}
      onClearLayout={vi.fn()}
      onClearWalls={vi.fn()}
      onClearAll={vi.fn()}
      {...overrides}
    />,
  );
  return { onToolModeChange, ...view };
}

describe("TopBar tools dropdown", () => {
  it("hides drawing tools when no plan is loaded", () => {
    renderTopBar({ hasPlan: false });
    expect(
      screen.queryByRole("button", { name: "Select" }),
    ).not.toBeInTheDocument();
  });

  it("shows the current tool on the trigger and keeps other tools in the menu", async () => {
    const user = userEvent.setup();
    renderTopBar({ toolMode: "select" });

    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("menu", { name: "Drawing tools" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Select" }));

    expect(screen.getByRole("menu", { name: "Drawing tools" })).toBeVisible();
    for (const label of TOOL_LABELS) {
      expect(screen.getByRole("menuitem", { name: label })).toBeVisible();
    }
  });

  it("labels the trigger with the active tool", () => {
    renderTopBar({ toolMode: "draw-wall" });
    expect(screen.getByRole("button", { name: "Wall" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
    expect(
      screen.queryByRole("button", { name: "Select" }),
    ).not.toBeInTheDocument();
  });

  it("chooses a tool from the menu and closes it", async () => {
    const user = userEvent.setup();
    const { onToolModeChange } = renderTopBar();

    await user.click(screen.getByRole("button", { name: "Select" }));
    await user.click(screen.getByRole("menuitem", { name: "Room" }));

    expect(onToolModeChange).toHaveBeenCalledTimes(1);
    expect(onToolModeChange).toHaveBeenCalledWith("draw-room");
    expect(screen.queryByRole("menu", { name: "Drawing tools" })).toBeNull();
  });

  it("does not emit a change when the current tool is chosen again", async () => {
    const user = userEvent.setup();
    const { onToolModeChange } = renderTopBar({ toolMode: "calibrate" });

    await user.click(screen.getByRole("button", { name: "Calibrate" }));
    await user.click(screen.getByRole("menuitem", { name: "Calibrate" }));

    expect(onToolModeChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "Drawing tools" })).toBeNull();
  });

  it("closes the menu on Escape", async () => {
    const user = userEvent.setup();
    renderTopBar();

    await user.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.getByRole("menu", { name: "Drawing tools" })).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Drawing tools" })).toBeNull();
  });

  it("maps each menu item to its tool mode", async () => {
    const expected: Record<string, ToolMode> = {
      Select: "select",
      Wall: "draw-wall",
      Room: "draw-room",
      Line: "draw-line",
      Rect: "draw-rect",
      Calibrate: "calibrate",
    };

    for (const [label, mode] of Object.entries(expected)) {
      const user = userEvent.setup();
      const { onToolModeChange, unmount } = renderTopBar({ toolMode: "pan" });
      await user.click(screen.getByRole("button", { name: "Tools" }));
      await user.click(screen.getByRole("menuitem", { name: label }));
      expect(onToolModeChange).toHaveBeenCalledWith(mode);
      unmount();
    }
  });
});
