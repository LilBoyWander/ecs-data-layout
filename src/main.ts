import './style.css';
import { EcsDataLayoutApp } from './app';

const appRoot = document.querySelector<HTMLDivElement>('#app');

if (!appRoot) {
  throw new Error('App root not found.');
}

new EcsDataLayoutApp(appRoot).mount();
