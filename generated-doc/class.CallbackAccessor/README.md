# `class` CallbackAccessor

[Documentation Index](../README.md)

## This class has

- [constructor](#-constructorcallbacks-callbacks-useabortnotcancel-boolean)
- 5 properties:
[closed](#-closed-promiseundefined),
[error](#-error-unknown),
[ready](#-ready-promiseundefined),
[waitBeforeClose](#-waitbeforeclose-promiseunknown--undefined),
[isClosed](#-get-isclosed-boolean)
- 3 methods:
[useCallbacks](#-usecallbackstusecallbacks-callbacks-callbacks--t--promiseliket-promiset),
[schedule](#-schedulettask---t--promiseliket-promiset),
[close](#-closeiscancelorabort-booleanfalse-reason-unknown-promisevoid)


#### 🔧 `constructor`(callbacks: [Callbacks](../type.Callbacks/README.md), useAbortNotCancel: `boolean`)



#### 📄 closed: Promise\<`undefined`>



#### 📄 error: `unknown`



#### 📄 ready: Promise\<`undefined`>



#### 📄 waitBeforeClose: Promise\<`unknown`> | `undefined`



#### 📄 `get` isClosed(): `boolean`



#### ⚙ useCallbacks\<T>(useCallbacks: (callbacks: [Callbacks](../type.Callbacks/README.md)) => T | PromiseLike\<T>): Promise\<T>



#### ⚙ schedule\<T>(task: () => T | PromiseLike\<T>): Promise\<T>



#### ⚙ close(isCancelOrAbort: `boolean`=false, reason?: `unknown`): Promise\<`void`>



