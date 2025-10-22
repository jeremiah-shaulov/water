# `class` ReadableStreamIterator `implements` AsyncIterableIterator\<Uint8Array>

[Documentation Index](../README.md)

## This class has

- [constructor](#-constructorreader-readablestreamdefaultreaderuint8array-preventcancel-boolean)
- [destructor](#-symboldispose-void)
- 4 methods:
[next](#-next-promiseitresultuint8arrayarraybufferlike),
[return](#-returnvalue-uint8array-promiseitresultdoneuint8arrayarraybufferlike),
[throw](#-throw-promiseitresultdoneuint8arrayarraybufferlike),
[\[Symbol.asyncIterator\]](#-symbolasynciterator-this)


#### 🔧 `constructor`(reader: ReadableStreamDefaultReader\<Uint8Array>, preventCancel: `boolean`)



#### 🔨 \[Symbol.dispose](): `void`



#### ⚙ next(): Promise\<ItResult\<Uint8Array\<ArrayBufferLike>>>



#### ⚙ return(value?: Uint8Array): Promise\<ItResultDone\<Uint8Array\<ArrayBufferLike>>>



#### ⚙ throw(): Promise\<ItResultDone\<Uint8Array\<ArrayBufferLike>>>



#### ⚙ \[Symbol.asyncIterator](): `this`



