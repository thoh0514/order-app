import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

const STORAGE_KEYS = { cart: 'order-app-cart' }

const API_BASE = import.meta.env.VITE_API_URL ?? ''

function apiUrl(path) {
  if (path.startsWith('http')) return path
  return `${API_BASE}${path}`
}

async function fetchJson(path, options = {}) {
  const { admin, ...rest } = options
  const headers = {
    'Content-Type': 'application/json',
    ...rest.headers,
  }
  const adminKey = import.meta.env.VITE_ADMIN_API_KEY
  if (admin && adminKey) {
    headers['X-Admin-Key'] = adminKey
  }
  const res = await fetch(apiUrl(path), { ...rest, headers })
  const text = await res.text()
  let data = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text.slice(0, 300) || '요청 실패' }
    }
  }
  if (!res.ok) {
    const msg = data.error || res.statusText || '요청 실패'
    const err = new Error(msg)
    err.status = res.status
    err.detail = data.detail
    throw err
  }
  return data
}

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function cartLineKey(menuId, optionIds) {
  const ids = [...optionIds].sort((a, b) => a - b)
  return `${menuId}:${ids.join(',')}`
}

function totalQtyForMenu(cart, menuId) {
  return cart.reduce(
    (sum, c) => (c.menu_id === menuId ? sum + c.quantity : sum),
    0
  )
}

/** 메뉴 가격·옵션·재고에 맞춰 장바구니 줄 단가·라벨을 갱신하고 재고를 넘는 수량을 줄입니다. */
function reconcileCart(menus, cart) {
  const menuById = new Map(menus.map((m) => [m.id, m]))

  const next = []
  for (const line of cart) {
    const m = menuById.get(line.menu_id)
    if (!m) continue
    const optById = new Map((m.options ?? []).map((o) => [o.id, o]))
    let optionPrice = 0
    const names = []
    let invalid = false
    for (const id of line.option_ids) {
      const o = optById.get(id)
      if (!o) {
        invalid = true
        break
      }
      optionPrice += o.price
      names.push(o.name)
    }
    if (invalid) continue

    const unitPrice = m.price + optionPrice
    const lineKey = cartLineKey(line.menu_id, line.option_ids)
    next.push({
      ...line,
      lineKey,
      name: m.name,
      image_url: m.image_url,
      optionsLabel: names.join(', '),
      unitPrice,
    })
  }

  const byMenu = new Map()
  for (const line of next) {
    if (!byMenu.has(line.menu_id)) byMenu.set(line.menu_id, [])
    byMenu.get(line.menu_id).push(line)
  }
  for (const lines of byMenu.values()) {
    const m = menuById.get(lines[0].menu_id)
    const stock = m?.stock_quantity ?? 0
    const total = lines.reduce((s, l) => s + l.quantity, 0)
    let overflow = total - stock
    if (overflow <= 0) continue
    for (let i = lines.length - 1; i >= 0 && overflow > 0; i--) {
      const line = lines[i]
      const take = Math.min(line.quantity, overflow)
      line.quantity -= take
      overflow -= take
    }
  }

  return next.filter((l) => l.quantity > 0)
}

function cartSnapshot(cart) {
  return [...cart]
    .sort((a, b) => a.lineKey.localeCompare(b.lineKey))
    .map((l) => `${l.lineKey}:${l.quantity}:${l.unitPrice}`)
    .join('|')
}

function App() {
  const [menus, setMenus] = useState([])
  const [menusLoading, setMenusLoading] = useState(true)
  const [menusError, setMenusError] = useState(null)

  const [cart, setCart] = useState(() => loadFromStorage(STORAGE_KEYS.cart, []))
  const [currentPage, setCurrentPage] = useState('order')

  const [adminMenus, setAdminMenus] = useState([])
  const [adminOrders, setAdminOrders] = useState([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState(null)

  const [toast, setToast] = useState(null)
  const [orderSubmitting, setOrderSubmitting] = useState(false)
  const menusSyncedRef = useRef(false)

  const loadMenus = useCallback(async () => {
    setMenusError(null)
    try {
      const data = await fetchJson('/api/menus')
      setMenus(data.menus ?? [])
    } catch (e) {
      setMenusError(e.message)
      setMenus([])
    } finally {
      setMenusLoading(false)
    }
  }, [])

  const loadAdmin = useCallback(async () => {
    setAdminError(null)
    setAdminLoading(true)
    try {
      const [mRes, oRes] = await Promise.all([
        fetchJson('/api/admin/menus', { admin: true }),
        fetchJson('/api/admin/orders', { admin: true }),
      ])
      setAdminMenus(mRes.menus ?? [])
      setAdminOrders(oRes.orders ?? [])
    } catch (e) {
      let msg = e.message || '요청 실패'
      if (e.status === 401) {
        const noKey = !import.meta.env.VITE_ADMIN_API_KEY
        msg = noKey
          ? '인증이 필요합니다. ui/.env.local 에 VITE_ADMIN_API_KEY=서버와_동일한_값 을 추가하고 Vite를 재시작하세요. (server/.env 의 ADMIN_API_KEY 와 맞춥니다.)'
          : '인증에 실패했습니다. VITE_ADMIN_API_KEY 가 서버의 ADMIN_API_KEY 와 일치하는지 확인한 뒤 Vite를 재시작하세요.'
      } else if (e.status === 503) {
        msg =
          '관리자 기능을 사용할 수 없습니다. 서버에 ADMIN_API_KEY가 설정되어 있는지 확인하세요.'
      }
      setAdminError(msg)
    } finally {
      setAdminLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMenus()
  }, [loadMenus])

  useEffect(() => {
    if (menus.length === 0) {
      menusSyncedRef.current = false
      return
    }
    setCart((prev) => {
      const next = reconcileCart(menus, prev)
      const changed = cartSnapshot(prev) !== cartSnapshot(next)
      if (changed && (menusSyncedRef.current || prev.length > 0)) {
        queueMicrotask(() =>
          setToast('메뉴 또는 재고가 변경되어 장바구니를 조정했습니다.')
        )
      }
      menusSyncedRef.current = true
      return next
    })
  }, [menus])

  useEffect(() => {
    if (currentPage === 'admin') loadAdmin()
  }, [currentPage, loadAdmin])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const showToast = (message) => setToast(message)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart))
  }, [cart])

  const addToCart = (item, selectedOptions) => {
    const picked = selectedOptions.filter((opt) => opt.selected)
    const optionIds = picked.map((opt) => opt.id).sort((a, b) => a - b)
    const optionNames = picked.map((opt) => opt.name).join(', ')
    const optionPrice = picked.reduce((sum, opt) => sum + opt.price, 0)
    const unitPrice = item.price + optionPrice
    const lineKey = cartLineKey(item.id, optionIds)

    const stock = item.stock_quantity ?? 0
    const used = totalQtyForMenu(cart, item.id)
    if (used + 1 > stock) {
      showToast('재고가 부족합니다.')
      return
    }

    const existingItem = cart.find((c) => c.lineKey === lineKey)

    if (existingItem) {
      setCart(
        cart.map((c) =>
          c.lineKey === lineKey ? { ...c, quantity: c.quantity + 1 } : c
        )
      )
    } else {
      setCart([
        ...cart,
        {
          lineKey,
          menu_id: item.id,
          name: item.name,
          image_url: item.image_url,
          option_ids: optionIds,
          optionsLabel: optionNames,
          unitPrice,
          quantity: 1,
        },
      ])
    }
  }

  const increaseQuantity = (lineKey) => {
    const line = cart.find((c) => c.lineKey === lineKey)
    if (!line) return
    const stock = menus.find((m) => m.id === line.menu_id)?.stock_quantity ?? 0
    const used = totalQtyForMenu(cart, line.menu_id)
    if (used + 1 > stock) {
      showToast('재고가 부족합니다.')
      return
    }
    setCart(
      cart.map((item) =>
        item.lineKey === lineKey
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    )
  }

  const decreaseQuantity = (lineKey) => {
    setCart(
      cart
        .map((item) =>
          item.lineKey === lineKey
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    )
  }

  const totalAmount = cart.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  )

  const handleOrder = async () => {
    if (cart.length === 0) {
      showToast('장바구니가 비어있습니다.')
      return
    }
    const items = cart.map((c) => ({
      menu_id: c.menu_id,
      quantity: c.quantity,
      option_ids: c.option_ids,
    }))
    const orderTotal = totalAmount
    setOrderSubmitting(true)
    try {
      const data = await fetchJson('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ items }),
      })
      setCart([])
      const oid = data.order?.id
      const paid = data.order?.total_amount ?? orderTotal
      showToast(
        oid != null
          ? `주문 #${oid}이(가) 접수되었습니다. 총 금액 ${paid.toLocaleString()}원`
          : `주문이 접수되었습니다. 총 금액 ${paid.toLocaleString()}원`
      )
      await loadMenus()
    } catch (e) {
      showToast(e.message || '주문에 실패했습니다.')
    } finally {
      setOrderSubmitting(false)
    }
  }

  const updateInventory = async (menuId, delta) => {
    try {
      await fetchJson(`/api/admin/menus/${menuId}/stock`, {
        admin: true,
        method: 'PATCH',
        body: JSON.stringify({ delta }),
      })
      await loadAdmin()
      await loadMenus()
    } catch (e) {
      showToast(e.message)
    }
  }

  const advanceOrderStatus = async (orderId) => {
    try {
      await fetchJson(`/api/admin/orders/${orderId}/status`, {
        admin: true,
        method: 'PATCH',
        body: JSON.stringify({}),
      })
      await loadAdmin()
    } catch (e) {
      showToast(e.message)
    }
  }

  const totalOrderCount = adminOrders.length
  const pendingCount = adminOrders.filter((o) => o.status === '주문 접수').length
  const makingCount = adminOrders.filter((o) => o.status === '제조 중').length
  const doneCount = adminOrders.filter((o) => o.status === '완료').length

  return (
    <div className="app">
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <header className="header">
        <div className="brand">COZY</div>
        <nav className="navigation" aria-label="메인 메뉴">
          <button
            type="button"
            className={`nav-button ${currentPage === 'order' ? 'active' : ''}`}
            onClick={() => setCurrentPage('order')}
            aria-label="주문하기"
            aria-current={currentPage === 'order' ? 'page' : undefined}
          >
            주문하기
          </button>
          <button
            type="button"
            className={`nav-button ${currentPage === 'admin' ? 'active' : ''}`}
            onClick={() => setCurrentPage('admin')}
            aria-label="관리자"
            aria-current={currentPage === 'admin' ? 'page' : undefined}
          >
            관리자
          </button>
        </nav>
      </header>

      {currentPage === 'order' && (
        <>
          <main className="menu-section">
            {menusLoading && (
              <p className="page-hint" role="status">
                메뉴를 불러오는 중…
              </p>
            )}
            {menusError && (
              <p className="page-error" role="alert">
                {menusError}
              </p>
            )}
            <div className="menu-grid">
              {!menusLoading &&
                menus.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    onAddToCart={addToCart}
                  />
                ))}
            </div>
          </main>

          <div className="cart-section">
            <h2 className="cart-title">🛒 장바구니</h2>
            <div className="cart-content">
              <div className="cart-left">
                <div className="cart-items">
                  {cart.length === 0 ? (
                    <p className="empty-cart">장바구니가 비어있습니다.</p>
                  ) : (
                    cart.map((item) => (
                      <div key={item.lineKey} className="cart-item">
                        <div className="cart-item-image">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              onError={(e) => {
                                e.target.style.display = 'none'
                                if (e.target.nextElementSibling) {
                                  e.target.nextElementSibling.style.display = 'flex'
                                }
                              }}
                            />
                          ) : null}
                          <div
                            className="cart-image-placeholder"
                            style={{ display: item.image_url ? 'none' : 'flex' }}
                          >
                            🍵
                          </div>
                        </div>
                        <div className="cart-item-info">
                          <span className="cart-item-name">
                            {item.name}{' '}
                            {item.optionsLabel && `(${item.optionsLabel})`}
                          </span>
                          <span className="cart-item-price">
                            {(item.unitPrice * item.quantity).toLocaleString()}원
                          </span>
                        </div>
                        <div className="cart-item-quantity-controls">
                          <button
                            type="button"
                            className="quantity-button"
                            onClick={() => decreaseQuantity(item.lineKey)}
                            aria-label={`${item.name} 수량 감소`}
                          >
                            -
                          </button>
                          <span
                            className="cart-item-quantity"
                            aria-label={`${item.name} 수량 ${item.quantity}`}
                          >
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            className="quantity-button"
                            onClick={() => increaseQuantity(item.lineKey)}
                            aria-label={`${item.name} 수량 증가`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="cart-right">
                <div className="cart-summary">
                  <div className="total-amount">
                    <span className="total-label">총 금액</span>
                    <span className="total-value">
                      {totalAmount.toLocaleString()}원
                    </span>
                  </div>
                  <button
                    type="button"
                    className="order-button"
                    onClick={handleOrder}
                    disabled={orderSubmitting || cart.length === 0}
                    aria-label="주문하기"
                  >
                    {orderSubmitting ? '처리 중…' : '주문하기'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {currentPage === 'admin' && (
        <div className="admin-section">
          <section className="admin-dashboard">
            <h2 className="admin-section-title">관리자 대시보드</h2>
            {adminLoading && (
              <p className="page-hint" role="status">
                불러오는 중…
              </p>
            )}
            {adminError && (
              <p className="page-error" role="alert">
                {adminError}
              </p>
            )}
            <div className="dashboard-cards">
              <div className="dashboard-card">
                <span className="dashboard-label">총 주문</span>
                <span className="dashboard-value">{totalOrderCount}</span>
              </div>
              <div className="dashboard-card">
                <span className="dashboard-label">주문 접수</span>
                <span className="dashboard-value">{pendingCount}</span>
              </div>
              <div className="dashboard-card">
                <span className="dashboard-label">제조 중</span>
                <span className="dashboard-value">{makingCount}</span>
              </div>
              <div className="dashboard-card">
                <span className="dashboard-label">완료</span>
                <span className="dashboard-value">{doneCount}</span>
              </div>
            </div>
          </section>

          <section className="admin-inventory">
            <h2 className="admin-section-title">재고 현황</h2>
            <div className="inventory-cards">
              {adminMenus.map((item) => {
                const stock = item.stock_quantity ?? 0
                const statusText =
                  stock === 0 ? '품절' : stock < 5 ? '주의' : '정상'
                const statusClass =
                  stock === 0 ? 'out' : stock < 5 ? 'warn' : 'ok'
                return (
                  <div key={item.id} className="inventory-card">
                    <div className="inventory-card-header">
                      <span className="inventory-name">{item.name}</span>
                      <span
                        className={`inventory-status inventory-status--${statusClass}`}
                      >
                        {statusText}
                      </span>
                    </div>
                    <div className="inventory-stock">{stock}개</div>
                    <div className="inventory-controls">
                      <button
                        type="button"
                        className="inventory-btn inventory-btn--minus"
                        onClick={() => updateInventory(item.id, -1)}
                        disabled={stock <= 0 || adminLoading}
                        aria-label={`${item.name} 재고 감소`}
                      >
                        -
                      </button>
                      <button
                        type="button"
                        className="inventory-btn inventory-btn--plus"
                        onClick={() => updateInventory(item.id, 1)}
                        disabled={adminLoading}
                        aria-label={`${item.name} 재고 증가`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="admin-orders">
            <h2 className="admin-section-title">주문 현황</h2>
            {adminOrders.length === 0 && !adminLoading ? (
              <p className="admin-empty">접수된 주문이 없습니다.</p>
            ) : (
              <div className="order-list">
                {adminOrders.map((order) => {
                  const date = new Date(order.ordered_at)
                  const dateStr = `${date.getMonth() + 1}월 ${date.getDate()}일`
                  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
                  const optLabel = (opts) =>
                    opts && opts.length
                      ? ` (${opts.map((o) => o.name).join(', ')})`
                      : ''
                  return (
                    <div key={order.id} className="order-card">
                      <div className="order-card-header">
                        <span className="order-datetime">
                          {dateStr} {timeStr}
                        </span>
                        <span
                          className={`order-badge order-badge--${
                            order.status === '완료'
                              ? 'complete'
                              : order.status === '제조 중'
                                ? 'making'
                                : 'received'
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>
                      <div className="order-items">
                        {order.items.map((line, i) => (
                          <div
                            key={`${order.id}-${line.id}-${i}`}
                            className="order-item-line"
                          >
                            {line.menu_name}
                            {optLabel(line.options)} × {line.quantity} —{' '}
                            {line.line_amount.toLocaleString()}원
                          </div>
                        ))}
                      </div>
                      <div className="order-card-footer">
                        <span className="order-total">
                          총 금액 {order.total_amount.toLocaleString()}원
                        </span>
                        {order.status !== '완료' && (
                          <button
                            type="button"
                            className="order-action-btn"
                            onClick={() => advanceOrderStatus(order.id)}
                            disabled={adminLoading}
                            aria-label="다음 주문 단계"
                          >
                            {order.status === '주문 접수'
                              ? '제조 시작'
                              : '완료 처리'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function MenuItemCard({ item, onAddToCart }) {
  const [selectedOptions, setSelectedOptions] = useState(() =>
    (item.options ?? []).map((opt) => ({ ...opt, selected: false }))
  )

  useEffect(() => {
    setSelectedOptions(
      (item.options ?? []).map((opt) => ({ ...opt, selected: false }))
    )
  }, [item])

  const hasStock = item.in_stock !== false
  const isOutOfStock = item.in_stock === false

  const handleOptionChange = (optionId) => {
    setSelectedOptions(
      selectedOptions.map((opt) =>
        opt.id === optionId ? { ...opt, selected: !opt.selected } : opt
      )
    )
  }

  const handleAddToCart = () => {
    if (!hasStock) return
    onAddToCart(item, selectedOptions)
    setSelectedOptions(
      (item.options ?? []).map((opt) => ({ ...opt, selected: false }))
    )
  }

  const imageSrc = item.image_url

  return (
    <div className={`menu-card ${isOutOfStock ? 'menu-card--out' : ''}`}>
      <div className="menu-image">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={item.name}
            onError={(e) => {
              e.target.style.display = 'none'
              if (e.target.nextElementSibling) {
                e.target.nextElementSibling.style.display = 'flex'
              }
            }}
          />
        ) : null}
        <div
          className="image-placeholder"
          style={{ display: imageSrc ? 'none' : 'flex' }}
        >
          ☕
        </div>
      </div>
      <div className="menu-info">
        <h3 className="menu-name">{item.name}</h3>
        {isOutOfStock && <span className="menu-out-badge">품절</span>}
        <p className="menu-price">{item.price.toLocaleString()}원</p>
        <p className="menu-description">{item.description}</p>
        <div className="menu-options">
          {selectedOptions.map((option) => (
            <label key={option.id} className="option-checkbox">
              <input
                type="checkbox"
                checked={option.selected}
                onChange={() => handleOptionChange(option.id)}
                disabled={isOutOfStock}
              />
              <span>
                {option.name} (
                {option.price > 0
                  ? `+${option.price.toLocaleString()}원`
                  : '+0원'}
                )
              </span>
            </label>
          ))}
        </div>
        <button
          type="button"
          className="add-to-cart-button"
          onClick={handleAddToCart}
          disabled={isOutOfStock}
          aria-label={
            isOutOfStock ? `${item.name} 품절` : `${item.name} 장바구니에 담기`
          }
        >
          {isOutOfStock ? '품절' : '담기'}
        </button>
      </div>
    </div>
  )
}

export default App
