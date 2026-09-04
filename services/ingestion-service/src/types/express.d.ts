import { ServiceIdentity } from "./telemetry";

declare global {
  namespace Express {
    interface Request { serviceIdentity?: ServiceIdentity }
  }
}
export {};
