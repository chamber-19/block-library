// Module shims for the toolkit's plain-JS JSX exports.
//
// @chamber-19/desktop-toolkit ships JSX / JS without bundled .d.ts files.
// block-library is strict TS, so importing untyped JSX fails resolution.
// Declare the surface block-library uses here; expand as we adopt more
// toolkit modules.

declare module "@chamber-19/desktop-toolkit/activation" {
  import type { ReactNode } from "react";

  export interface ActivationGateProps {
    children: ReactNode;
  }

  export function ActivationGate(props: ActivationGateProps): JSX.Element;
}

declare module "@chamber-19/desktop-toolkit/theme" {
  import type { ReactNode } from "react";

  export interface ToolkitThemeProviderProps {
    storageKey?: string;
    children: ReactNode;
  }

  export function ToolkitThemeProvider(props: ToolkitThemeProviderProps): JSX.Element;
}