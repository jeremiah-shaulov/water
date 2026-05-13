# `class` Writer `extends` [ReaderOrWriter](../class.ReaderOrWriter/README.md)\<[WriteCallbackAccessor](../class.WriteCallbackAccessor/README.md)>

[Documentation Index](../README.md)

```ts
import {Writer} from "jsr:@shaulov/water@1.2.0"
```

## This class has

- [constructor](#-constructorcallbackaccessor-somecallbackaccessor--undefined-onrelease-voidfunction)
- 2 properties:
[desiredSize](#-get-desiredsize-number),
[ready](#-get-ready-promiseundefined)
- 4 methods:
[write](#-writechunk-uint8array--string-promisevoid),
[flush](#-flush-promisevoid),
[close](#-close-promisevoid),
[abort](#-abortreason-unknown-promisevoid)
- 7 inherited members from [ReaderOrWriter](../class.ReaderOrWriter/README.md)


#### 🔧 `constructor`(callbackAccessor: SomeCallbackAccessor | `undefined`, onRelease: VoidFunction)



#### 📄 `get` desiredSize(): `number`



#### 📄 `get` ready(): Promise\<`undefined`>



#### ⚙ write(chunk?: Uint8Array | `string`): Promise\<`void`>

> Writes the chunk by calling `sink.write()`
> till the whole chunk is written (if `sink.write()` returns `0`, throws error).



#### ⚙ flush(): Promise\<`void`>



#### ⚙ close(): Promise\<`void`>



#### ⚙ abort(reason?: `unknown`): Promise\<`void`>



