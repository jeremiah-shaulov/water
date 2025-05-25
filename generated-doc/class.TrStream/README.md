# `class` TrStream `extends` TransformStream\<Uint8Array, Uint8Array>

[Documentation Index](../README.md)

```ts
import {TrStream} from "https://deno.land/x/water@v1.0.27/mod.ts"
```

## This class has

- [constructor](#-constructortransformer-transformer)
- 2 properties:
[writable](#-override-readonly-writable-wrstream),
[readable](#-override-readonly-readable-rdstream)
- base class


#### 🔧 `constructor`(transformer: [Transformer](../type.Transformer/README.md))



#### 📄 `override` `readonly` writable: [WrStream](../class.WrStream/README.md)

> Input for the original stream.
> All the bytes written here will be transformed by this object, and will be available for reading from `TrStream.readable`.



#### 📄 `override` `readonly` readable: [RdStream](../class.RdStream/README.md)

> Outputs the transformed stream.



