import { useStore } from './src/store/useStore';
const state = useStore.getState();
console.log('Init state:', state.apiKeys);
setTimeout(() => {
    console.log('Hydrated state:', useStore.getState().apiKeys);
}, 2000);
