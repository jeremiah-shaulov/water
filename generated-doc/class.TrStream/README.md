# `class` TrStream `extends` TransformStream\<Uint8Array, Uint8Array>

[Documentation Index](../README.md)

```ts
import {TrStream} from "jsr:@shaulov/water@1.0.32"
```

This object creates a pair of readable and writable streams, and allows to transform data
written to it's writable stream by a user-provided callback function, making the transformed data
available for reading from it's readable stream.

The transformation function is optional.
If you omit it, the object will simply pass the data through it, and it can be used to convert
a writable stream to a readable one.
This is particularly useful when you want to use writer to write a web server response body.

```ts
const {writable, readable} = new TrStream({flush: () => promise});

// deno-lint-ignore no-var
var promise = writeResponse(writable);

return new Response(readable, {headers: {'Content-Type': 'text/html'}});

async function writeResponse(writable: WrStream)
{	try
	{	await writable.write('Content');
	}
	finally
	{	writable.close().catch(e => console.error(e)); // don't await the returned promise to avoid deadlock
	}
}
```

## This class has

- [constructor](#-constructortransformer-transformer)
- 2 properties:
[writable](#-override-readonly-writable-wrstream),
[readable](#-override-readonly-readable-rdstream)
- base class


#### 🔧 `constructor`(transformer?: [Transformer](../type.Transformer/README.md))



#### 📄 `override` `readonly` writable: [WrStream](../class.WrStream/README.md)

> Input for the original stream.
> All the bytes written here will be transformed by this object, and will be available for reading from `TrStream.readable`.



#### 📄 `override` `readonly` readable: [RdStream](../class.RdStream/README.md)

> Outputs the transformed stream.



