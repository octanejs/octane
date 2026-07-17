// TypeScript does not parse the TSRX file extension. Vite compiles these modules
// with Octane's compiler; this declaration keeps their imports visible to strict
// checking of the TypeScript entry point and support modules.
declare module '*.tsrx';
