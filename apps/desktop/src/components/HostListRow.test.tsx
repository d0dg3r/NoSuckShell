import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HostListRow } from "./HostListRow";
import { noopBridge, sampleHost, sampleRow } from "../test/host-list-row-fixtures";

describe("HostListRow", () => {
  it("renders host alias and display user", () => {
    render(<HostListRow row={sampleRow()} {...noopBridge()} />);
    expect(screen.getByText("mybox")).toBeInTheDocument();
    expect(screen.getByText(/deploy · mybox\.example · port 22/)).toBeInTheDocument();
  });

  it("omits hostname in meta when it matches the host alias", () => {
    render(
      <HostListRow
        row={sampleRow({
          host: { ...sampleHost, host: "same", hostName: "same" },
        })}
        {...noopBridge()}
      />,
    );
    expect(screen.getByText(/deploy · port 22/)).toBeInTheDocument();
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

  it("calls setActiveHost when host row is clicked", () => {
    const setActiveHost = vi.fn();
    const { container } = render(<HostListRow row={sampleRow()} {...noopBridge({ setActiveHost })} />);
    const rowEl = container.querySelector(".host-row");
    expect(rowEl).toBeTruthy();
    const hostItem = rowEl!.querySelector<HTMLElement>('[aria-label="SSH host mybox"]');
    expect(hostItem).toBeTruthy();
    fireEvent.click(hostItem!);
    expect(setActiveHost).toHaveBeenCalledWith("mybox");
  });

  it("calls onEditHost when overflow button is clicked", () => {
    const onEditHost = vi.fn();
    const { container } = render(<HostListRow row={sampleRow()} {...noopBridge({ onEditHost })} />);
    const overflowBtn = container.querySelector<HTMLButtonElement>('[aria-label="Open host settings for mybox"]');
    expect(overflowBtn).toBeTruthy();
    fireEvent.click(overflowBtn!);
    expect(onEditHost).toHaveBeenCalledWith(sampleHost);
  });
});
