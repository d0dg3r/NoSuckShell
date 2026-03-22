import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HostListRow } from "./HostListRow";
import { noopBridge, sampleHost, sampleRow } from "../test/host-list-row-fixtures";

describe("HostListRow", () => {
  it("renders host alias and display user", () => {
    render(<HostListRow row={sampleRow()} {...noopBridge()} />);
    expect(screen.getByText("mybox")).toBeInTheDocument();
    expect(screen.getByText("deploy")).toBeInTheDocument();
  });

  it("calls toggleFavoriteForHost when favorite is clicked", () => {
    const toggleFavoriteForHost = vi.fn();
    const { container } = render(<HostListRow row={sampleRow()} {...noopBridge({ toggleFavoriteForHost })} />);
    const rowEl = container.querySelector(".host-row");
    expect(rowEl).toBeTruthy();
    const btn = rowEl!.querySelector<HTMLButtonElement>('[aria-label="Toggle favorite for mybox"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(toggleFavoriteForHost).toHaveBeenCalledWith("mybox");
  });

  it("calls toggleHostSelection when host item is activated", () => {
    const toggleHostSelection = vi.fn();
    const { container } = render(<HostListRow row={sampleRow()} {...noopBridge({ toggleHostSelection })} />);
    const rowEl = container.querySelector(".host-row");
    expect(rowEl).toBeTruthy();
    const hostItem = rowEl!.querySelector<HTMLElement>('[aria-label="SSH host mybox"]');
    expect(hostItem).toBeTruthy();
    fireEvent.click(hostItem!);
    expect(toggleHostSelection).toHaveBeenCalledWith(sampleHost);
  });

  it("opens slide panel with HostForm when menu is open for this row", () => {
    render(
      <HostListRow
        row={sampleRow()}
        {...noopBridge({
          openHostMenuHostAlias: "mybox",
          activeHost: "mybox",
        })}
      />,
    );
    expect(screen.getAllByDisplayValue("mybox")[0]).toBeInTheDocument();
  });
});
