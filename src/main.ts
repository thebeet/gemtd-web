import { createApp } from 'vue'
import TowerGame from './TowerGame.vue'
import './style.css'

if (location.pathname === '/' || location.pathname === '') {
  history.replaceState(null, '', `/game${location.search}${location.hash}`)
}

createApp(TowerGame).mount('#app')
