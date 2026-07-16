"use client";

import { createContext, useContext } from "react";

export interface ActiveShowInfo {
  id: string;
  name: string;
}

const ShowModeContext = createContext<ActiveShowInfo | null>(null);

export function ShowModeProvider({
  value,
  children,
}: {
  value: ActiveShowInfo | null;
  children: React.ReactNode;
}) {
  return <ShowModeContext.Provider value={value}>{children}</ShowModeContext.Provider>;
}

/** The active Show Mode session, or null. */
export function useActiveShow(): ActiveShowInfo | null {
  return useContext(ShowModeContext);
}
