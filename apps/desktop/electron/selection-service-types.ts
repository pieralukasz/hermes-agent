// Wire shape of the macOS Services status shared by main (selection-service.ts)
// and the renderer (settings). Kept free of Node imports so the renderer can use it.
export interface SelectionServiceStatus {
  supported: boolean
  installed: boolean
  /** Installed by a build whose scheme/inbox differ (or an older format). */
  stale: boolean
  includeContext: boolean
  serviceName: string
  workflowPath: string
  shortcut: string
}
