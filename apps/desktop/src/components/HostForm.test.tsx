import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultHostBinding } from "../features/app-bootstrap";
import { HostForm } from "./HostForm";

describe("HostForm", () => {
  it("updates numeric port through callback", () => {
    const onChange = vi.fn();
    const onHostBindingChange = vi.fn();
    render(
      <HostForm
        host={{
          host: "prod",
          hostName: "example.com",
          user: "root",
          port: 22,
          identityFile: "",
          proxyJump: "",
          proxyCommand: "",
        }}
        onChange={onChange}
        storeKeys={[]}
        hostBinding={createDefaultHostBinding()}
        onHostBindingChange={onHostBindingChange}
        storeUsers={[]}
        sshHosts={[]}
        hostAliasForJumpExclude=""
        hostMetadataByHost={{}}
      />,
    );

    fireEvent.change(screen.getByLabelText("Port"), { target: { value: "2201" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 2201,
      }),
    );
  });
});
