// Lets the harness import the example config as data, and keeps JSON imports typed elsewhere.
declare module '*.json' {
  const value: unknown;
  export default value;
}
