export type Env = {
  readonly "NODE_ENV": "development" | "test" | "production";
  readonly "DATABASE_URL": string;
  readonly "PORT": number;
  readonly "DEBUG": boolean;
  readonly "API_KEY": string;
};
export declare function loadEnv(env?: Record<string, string | undefined>): Readonly<Env>;
export default loadEnv;
