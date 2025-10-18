# `class` Piper

[Documentation Index](../README.md)

## This class has

- [constructor](#-constructorbuffer-uint8arrayarraybuffer-autoallocatemin-number)
- 5 methods:
[pipeTo](#-pipetowriterclosedpromise-promisevoid-callbacksforread-callbacks-callbackwriteinverting-chunk-uint8array-canreturnzero-boolean--number--promiselikenumber-promiseboolean),
[read](#-readview-uint8array-uint8arrayarraybufferlike),
[unread](#-unreadchunk-uint8array-void),
[unwrap](#-unwrap-uint8arrayarraybuffer),
[dispose](#-dispose-uint8arrayarraybuffer)


#### 🔧 `constructor`(buffer: Uint8Array\<ArrayBuffer>, autoAllocateMin: `number`)



#### ⚙ pipeTo(writerClosedPromise: Promise\<`void`>, callbacksForRead: [Callbacks](../type.Callbacks/README.md), callbackWriteInverting: (chunk: Uint8Array, canReturnZero: `boolean`) => `number` | PromiseLike\<`number`>): Promise\<`boolean`>



#### ⚙ read(view: Uint8Array): Uint8Array\<ArrayBufferLike>



#### ⚙ unread(chunk: Uint8Array): `void`



#### ⚙ unwrap(): Uint8Array\<ArrayBuffer>



#### ⚙ dispose(): Uint8Array\<ArrayBuffer>



