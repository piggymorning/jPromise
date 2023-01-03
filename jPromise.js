

function callOnlyOnce(func) {
	let wrapFunction = function (e) {
		if (!wrapFunction.isCalled && (!wrapFunction.partner || (wrapFunction.partner && !wrapFunction.partner.isCalled))) {
			wrapFunction.isCalled = true
			return func(e)
		}
	}
	wrapFunction.isCalled = false
	wrapFunction.partner = null
	wrapFunction.addPartner = function (e) {
		wrapFunction.partner = e
	}
	return wrapFunction
}

class Promiser {
	state = 'pending'
	value = null
	subscribeInstance = []
	onFulfilled = null
	onRejected = null
	constructor(func) {
		func.call(this, this.resolve.bind(this), this.reject.bind(this))
	}
	then(onFulfilled, onRejected) {
		const that = this
		const { state } = this
		return new Promiser(function () {
			// 保证onFulfilled和onRejected回调只会被当做函数执行，没有this值
			this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled.bind(undefined) : onFulfilled
			this.onRejected = typeof onRejected === 'function' ? onRejected.bind(undefined) : onRejected
			/*这一步很关键，promise使用时的链式调用法，决定了所有的then方法都是一次性执行完毕的，因此需要将then里面的回调函数
			提前存起来，由于这些回调函数是需要上一个priomise的resolve方法触发的，因此应该存在上个promise的变量中*/
			that.subscribeInstance.push(this)
			// 处理特殊情况，比如鼠标点击事件的回调函数，去获取一个不处于pending状态下的promise中的值
			if (state !== 'pending') {
				process.nextTick(that.process.bind(that))
			}
		})
	}
	resolve(e) {
		const that = this
		if (e === this) {
			// promise A+规范要求:如果resolve接受的值等于promise本身的处理
			this.reject(new TypeError('循环引用了'))
		} else if (e instanceof Promiser) {
			e.then(function (value) { that.resolve(value) }, function (error) { that.reject(error) })
		} else if (typeof e === 'function' || Object.prototype.toString.call(e) === '[object Object]') {
			try {
				const { then } = e
				if (typeof then === 'function') {
					// promise A+规范要求:then中的两个回调函数只能被调用一次，且其中一个被调用了，另外一个就不能再被调用了,因此写了个工具函数callOnlyOnce
					const successHandle = callOnlyOnce(function (v1) { that.resolve(v1) })
					const errorHandle = callOnlyOnce(function (v2) { that.reject(v2) })
					successHandle.addPartner(errorHandle)
					errorHandle.addPartner(successHandle)
					try {
						then.call(e, successHandle, errorHandle)
					} catch (thenCalllError) {
						// promise A+规范要求:调用回调函数时出错了，如果有回调函数被调用过了，那么忽略，如果都没被调用过，则reject这个promsie
						if (successHandle.isCalled || errorHandle.isCalled) return
						else that.reject(thenCalllError)
					}
				} else {
					// promise A+规范要求:如果then方法不是函数，那么直接当做普通值处理
					if (this.state === 'pending') {
						this.state = 'fulfilled'
						this.value = e
						// 在node环境下，用nextTick实现微任务操作
						process.nextTick(this.process.bind(this))
					}
				}
			} catch (error) {
				this.reject(error)
			}
		} else {
			// e不是promise和thenable的情况，作为一个普通的值传递下去
			if (this.state === 'pending') {
				this.state = 'fulfilled'
				this.value = e
				process.nextTick(this.process.bind(this))
			}
		}
	}
	process() {
		const { state, value } = this
		if (this.subscribeInstance.length > 0) {
			for (let instance of this.subscribeInstance) {
				// 只有在当前promsie状态改变了，但是后面接的promise状态还没变，才进行处理，避免重复改变promise状态
				if (state !== 'pending' && instance.state === 'pending') {
					const handleFunc = state === 'fulfilled' ? instance.onFulfilled : instance.onRejected
					if (handleFunc && typeof handleFunc === 'function') {
						try {
							// 这里有一点需要注意，即便state reject了，只要是处理了，那后面的promise还是正常执行
							const thenResult = handleFunc(value)
							if (thenResult === instance) {
								throw new TypeError('循环引用了')
							}
							if (thenResult instanceof Promiser) {
								thenResult.then(function (e) { instance.resolve(e) }, function (e) { instance.reject(e) })
							} else {
								// 如果then方法回调函数返回的是普通值，那么直接resolve promise，把值传过去
								instance.resolve(thenResult)
							}
						} catch (e) {
							instance.reject(e)
						}
					} else {
						state === 'fulfilled' ? instance.resolve(value) : instance.reject(value)
					}
				}
			}
		}
	}
	reject(e) {
		// reject方法要比reject方法简单的多，因为promise已经reject了，就不用像resolve一样还去分析接收到的参数是什么
		if (this.state === 'pending') {
			this.state = 'rejected'
			this.value = e
			process.nextTick(this.process.bind(this))
		}
	}
}




module.exports = {
    resolved: function (value) {
        return new Promiser(function (resolve) {
            resolve(value);
        });
    },
    rejected: function (reason) {
        return new Promiser(function (resolve, reject) {
            reject(reason);
        });
    },
    deferred: function () {
        var resolve, reject;

        return {
            promise: new Promiser(function (rslv, rjct) {
                resolve = rslv;
                reject = rjct;
            }),
            resolve: resolve,
            reject: reject
        };
    }
};
