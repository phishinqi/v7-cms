/// <reference types="vite/client" />

// `?url` imports resolve to the emitted asset's path, which is how the stylesheet is found at
// runtime in library mode.
declare module '*?url' {
  const url: string;
  export default url;
}
