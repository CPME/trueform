# OCCT Native Server

Minimal native OCCT/XCAF HTTP service that implements:

- `/v1/exec-feature` (currently only `feature.extrude` with inline profiles)
- `/v1/mesh`
- `/v1/export-step`
- `/v1/export-step-pmi` (XCAF PMI embedded into AP242)

## Build

```bash
cd /home/eveber/code/trueform
cmake -S native/occt_server -B native/occt_server/build
cmake --build native/occt_server/build -j
```

## Run

```bash
cd /home/eveber/code/trueform
./native/occt_server/build/occt_server 127.0.0.1 8081
```

## JS integration (example)

Use `HttpOcctTransport` + `OcctNativeBackend`:

```ts
import { HttpOcctTransport, OcctNativeBackend } from "trueform";

const transport = new HttpOcctTransport({ baseUrl: "http://127.0.0.1:8081" });
const backend = new OcctNativeBackend({ transport });
```

## Tests

Live server e2e:

```bash
cd /home/eveber/code/trueform
TF_NATIVE_SERVER=1 node dist/tests/occt_native_server_pmi.e2e.test.js
```
