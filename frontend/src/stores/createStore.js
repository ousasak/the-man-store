import { useState, useEffect, useRef } from 'react';

/**
 * Lightweight Reactive Store with identical API to Zustand
 * Zero-dependency, offline-safe, high performance
 */
export function create(initializer) {
  let state;
  const listeners = new Set();

  const setState = (partial, replace) => {
    const nextState = typeof partial === 'function' ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = replace || typeof nextState !== 'object' || nextState === null
        ? nextState
        : { ...state, ...nextState };
      listeners.forEach((listener) => listener(state, previousState));
    }
  };

  const getState = () => state;

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  state = initializer(setState, getState, { setState, getState, subscribe });

  const useStore = (selector = (s) => s) => {
    const [, forceUpdate] = useState({});
    const selectorRef = useRef(selector);
    selectorRef.current = selector;

    const sliceRef = useRef();
    sliceRef.current = selector(state);

    useEffect(() => {
      const listener = (currentState) => {
        try {
          const nextSlice = selectorRef.current(currentState);
          if (!Object.is(sliceRef.current, nextSlice)) {
            sliceRef.current = nextSlice;
            forceUpdate({});
          }
        } catch (err) {
          forceUpdate({});
        }
      };
      return subscribe(listener);
    }, []);

    return sliceRef.current;
  };

  Object.assign(useStore, {
    getState,
    setState,
    subscribe,
  });

  return useStore;
}

export default create;
