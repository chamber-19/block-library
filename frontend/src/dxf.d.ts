declare module 'dxf' {
  export function parseString(dxf: string): {
    entities?: any[]
    blocks?: Record<string, any>
    header?: Record<string, any>
  }
}
