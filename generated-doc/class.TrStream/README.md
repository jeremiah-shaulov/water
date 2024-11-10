# `class` TrStream `extends` TransformStream\<Uint8Array, Uint8Array>

[Documentation Index](../README.md)

```ts
import {TrStream} from "https://deno.land/x/water@v1.0.24/mod.ts"
```

## This class has

- [constructor](#-constructortransformer-transformer)
- 2 properties:
[writable](#-readonly-writable-wrstream),
[readable](#-readonly-readable-rdstream)


#### 🔧 `constructor`(transformer: [Transformer](../type.Transformer/README.md))



#### 📄 `readonly` writable: [WrStream](../class.WrStream/README.md)

> Input for the original stream.
> All the bytes written here will be transformed by this object, and will be available for reading from `TrStream.readable`.



#### 📄 `readonly` readable: [RdStream](../class.RdStream/README.md)

> Outputs the transformed stream.



