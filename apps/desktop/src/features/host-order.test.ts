import { describe, expect, it } from "vitest";
import { sortRowsByFavoriteThenAlias } from "./host-order";

type TestHostRow = {
  host: { host: string };
  metadata: { favorite: boolean };
  connected: boolean;
};

describe("host sidebar ordering", () => {
  it("sorts connected and disconnected rows with favorites first and alias alphabetical", () => {
    const rows: TestHostRow[] = [
      { host: { host: "delta" }, metadata: { favorite: false }, connected: false },
      { host: { host: "charlie" }, metadata: { favorite: true }, connected: false },
      { host: { host: "echo" }, metadata: { favorite: false }, connected: true },
      { host: { host: "alpha" }, metadata: { favorite: true }, connected: true },
      { host: { host: "bravo" }, metadata: { favorite: false }, connected: true },
      { host: { host: "foxtrot" }, metadata: { favorite: true }, connected: false },
    ];

    const connectedRows = sortRowsByFavoriteThenAlias(rows.filter((row) => row.connected));
    const disconnectedRows = sortRowsByFavoriteThenAlias(rows.filter((row) => !row.connected));

    expect(connectedRows.map((row) => row.host.host)).toEqual(["alpha", "bravo", "echo"]);
    expect(disconnectedRows.map((row) => row.host.host)).toEqual(["charlie", "foxtrot", "delta"]);
  });
});
