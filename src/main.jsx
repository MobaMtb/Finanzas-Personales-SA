import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// Si algo falla, muestra el error en pantalla en vez de dejarla en blanco
class Atrapa extends Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24, color: '#fff', background: '#151B31', minHeight: '100vh' }}>
        <h2 style={{ marginTop: 0 }}>La app tuvo un error</h2>
        <p>Saca captura de esto y mándasela a Claude:</p>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#232C50', padding: 12, borderRadius: 8, fontSize: 12 }}>
          {String(this.state.err?.stack || this.state.err)}
        </pre>
        <button onClick={() => location.reload()} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#3E7BFA', color: '#fff', cursor: 'pointer' }}>Recargar</button>
      </div>
    )
  }
}

window.addEventListener('error', (e) => {
  const r = document.getElementById('root')
  if (r && !r.hasChildNodes()) r.innerHTML = '<pre style="color:#fff;background:#151B31;padding:24px;min-height:100vh;margin:0;white-space:pre-wrap">Error al cargar la app:\n' + (e.error?.stack || e.message) + '</pre>'
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Atrapa><App /></Atrapa>
  </StrictMode>,
)
