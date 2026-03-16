import { useState, useEffect } from 'react'
import './App.css'

const STORAGE_KEYS = { cart: 'order-app-cart', orders: 'order-app-orders', inventory: 'order-app-inventory' }

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function App() {
  // 임의의 커피 메뉴 데이터
  const [menuItems] = useState([
    {
      id: 1,
      name: '아메리카노(ICE)',
      price: 4000,
      description: '시원하고 깔끔한 아이스 아메리카노',
      image: 'https://images.unsplash.com/photo-1517487881594-2787fef5ebf7?w=400&h=300&fit=crop'
    },
    {
      id: 2,
      name: '아메리카노(HOT)',
      price: 4000,
      description: '따뜻하고 진한 핫 아메리카노',
      image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=300&fit=crop'
    },
    {
      id: 3,
      name: '카페라떼',
      price: 5000,
      description: '부드러운 우유와 에스프레소의 조화',
      image: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&h=300&fit=crop'
    },
    {
      id: 4,
      name: '카푸치노',
      price: 5000,
      description: '우유 거품이 올라간 부드러운 카푸치노',
      image: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400&h=300&fit=crop'
    },
    {
      id: 5,
      name: '카라멜 마키아토',
      price: 6000,
      description: '달콤한 카라멜과 에스프레소의 만남',
      image: 'https://images.unsplash.com/photo-1570968914863-906a7e34a8e0?w=400&h=300&fit=crop'
    },
    {
      id: 6,
      name: '바닐라라떼',
      price: 5500,
      description: '바닐라 시럽이 들어간 부드러운 라떼',
      image: 'https://images.unsplash.com/photo-1517487881594-2787fef5ebf7?w=400&h=300&fit=crop'
    }
  ])

  // 옵션 데이터
  const options = [
    { id: 'shot', name: '샷 추가', price: 500 },
    { id: 'syrup', name: '시럽 추가', price: 0 }
  ]

  // 장바구니 상태 (localStorage 복원)
  const [cart, setCart] = useState(() => loadFromStorage(STORAGE_KEYS.cart, []))
  const [currentPage, setCurrentPage] = useState('order')

  // 주문 목록 (localStorage 복원)
  const [orders, setOrders] = useState(() => loadFromStorage(STORAGE_KEYS.orders, []))

  // 재고 현황 (localStorage 복원)
  const [inventory, setInventory] = useState(() => loadFromStorage(STORAGE_KEYS.inventory, { 1: 10, 2: 8, 3: 3 }))

  // 토스트 알림
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const showToast = (message) => setToast(message)

  // localStorage 영속화
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart))
  }, [cart])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orders))
  }, [orders])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(inventory))
  }, [inventory])

  // 장바구니에 추가
  const addToCart = (item, selectedOptions) => {
    const optionNames = selectedOptions
      .filter(opt => opt.selected)
      .map(opt => opt.name)
      .join(', ')

    const optionPrice = selectedOptions
      .filter(opt => opt.selected)
      .reduce((sum, opt) => sum + opt.price, 0)

    const cartItem = {
      id: `${item.id}-${selectedOptions.map(o => o.selected ? o.id : '').join('-')}`,
      itemId: item.id,
      name: item.name,
      options: optionNames,
      price: item.price + optionPrice,
      quantity: 1,
      image: item.image
    }

    // 같은 상품과 옵션 조합이면 수량 증가
    const existingItem = cart.find(
      c => c.itemId === item.id && c.options === optionNames
    )

    if (existingItem) {
      setCart(cart.map(c =>
        c.id === existingItem.id
          ? { ...c, quantity: c.quantity + 1 }
          : c
      ))
    } else {
      setCart([...cart, cartItem])
    }
  }

  // 수량 증가
  const increaseQuantity = (itemId) => {
    setCart(cart.map(item =>
      item.id === itemId
        ? { ...item, quantity: item.quantity + 1 }
        : item
    ))
  }

  // 수량 감소 (1일 때 - 누르면 장바구니에서 제거)
  const decreaseQuantity = (itemId) => {
    setCart(
      cart
        .map(item =>
          item.id === itemId ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter(item => item.quantity > 0)
    )
  }

  // 총 금액 계산
  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)

  // 주문하기 (재고 반영 + 토스트 알림)
  const handleOrder = () => {
    if (cart.length === 0) {
      showToast('장바구니가 비어있습니다.')
      return
    }
    const now = new Date()
    const newOrder = {
      id: Date.now(),
      createdAt: now.toISOString(),
      items: cart.map(c => ({
        name: c.name,
        options: c.options,
        quantity: c.quantity,
        price: c.price,
        subtotal: c.price * c.quantity
      })),
      totalAmount,
      status: '주문접수'
    }
    setOrders(prev => [newOrder, ...prev])
    setCart([])
    // 주문한 메뉴에 대해 재고 감소 (재고 관리 대상 메뉴만)
    setInventory(prev => {
      const next = { ...prev }
      cart.forEach(c => {
        if (c.itemId in next) {
          next[c.itemId] = Math.max(0, (next[c.itemId] ?? 0) - c.quantity)
        }
      })
      return next
    })
    showToast(`주문이 완료되었습니다! 총 금액: ${totalAmount.toLocaleString()}원`)
  }

  // 재고 증가/감소
  const updateInventory = (menuId, delta) => {
    setInventory(prev => ({
      ...prev,
      [menuId]: Math.max(0, (prev[menuId] ?? 0) + delta)
    }))
  }

  // 주문 상태 변경: 주문접수 -> 제조중
  const startManufacturing = (orderId) => {
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status: '제조중' } : o))
    )
  }

  // 주문 상태 변경: 제조중 -> 완료
  const completeOrder = (orderId) => {
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status: '완료' } : o))
    )
  }

  return (
    <div className="app">
      {/* 토스트 알림 */}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {/* 헤더 영역 */}
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

      {/* 주문하기 화면 */}
      {currentPage === 'order' && (
        <>
          {/* 상품 표시 영역 */}
          <main className="menu-section">
            <div className="menu-grid">
              {menuItems.map(item => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  options={options}
                  inventory={inventory}
                  onAddToCart={addToCart}
                />
              ))}
            </div>
          </main>

          {/* 장바구니 영역 */}
          <div className="cart-section">
            <h2 className="cart-title">🛒 장바구니</h2>
            <div className="cart-content">
              <div className="cart-left">
                <div className="cart-items">
                  {cart.length === 0 ? (
                    <p className="empty-cart">장바구니가 비어있습니다.</p>
                  ) : (
                    cart.map(item => (
                      <div key={item.id} className="cart-item">
                        <div className="cart-item-image">
                          {item.image ? (
                            <img 
                              src={item.image} 
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
                            style={{ display: item.image ? 'none' : 'flex' }}
                          >
                            🍵
                          </div>
                        </div>
                        <div className="cart-item-info">
                          <span className="cart-item-name">
                            {item.name} {item.options && `(${item.options})`}
                          </span>
                          <span className="cart-item-price">
                            {(item.price * item.quantity).toLocaleString()}원
                          </span>
                        </div>
                        <div className="cart-item-quantity-controls">
                          <button
                            type="button"
                            className="quantity-button"
                            onClick={() => decreaseQuantity(item.id)}
                            aria-label={`${item.name} 수량 감소`}
                          >
                            -
                          </button>
                          <span className="cart-item-quantity" aria-label={`${item.name} 수량 ${item.quantity}`}>
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            className="quantity-button"
                            onClick={() => increaseQuantity(item.id)}
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
                    <span className="total-value">{totalAmount.toLocaleString()}원</span>
                  </div>
                  <button
                    type="button"
                    className="order-button"
                    onClick={handleOrder}
                    aria-label="주문하기"
                  >
                    주문하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 관리자 화면 */}
      {currentPage === 'admin' && (
        <div className="admin-section">
          {/* 관리자 대시보드 요약 */}
          <section className="admin-dashboard">
            <h2 className="admin-section-title">관리자 대시보드</h2>
            <div className="dashboard-cards">
              <div className="dashboard-card">
                <span className="dashboard-label">총 주문</span>
                <span className="dashboard-value">{orders.length}</span>
              </div>
              <div className="dashboard-card">
                <span className="dashboard-label">주문 접수</span>
                <span className="dashboard-value">
                  {orders.filter(o => o.status === '주문접수').length}
                </span>
              </div>
              <div className="dashboard-card">
                <span className="dashboard-label">제조중</span>
                <span className="dashboard-value">
                  {orders.filter(o => o.status === '제조중').length}
                </span>
              </div>
              <div className="dashboard-card">
                <span className="dashboard-label">완료</span>
                <span className="dashboard-value">
                  {orders.filter(o => o.status === '완료').length}
                </span>
              </div>
            </div>
          </section>

          {/* 재고 현황 */}
          <section className="admin-inventory">
            <h2 className="admin-section-title">재고 현황</h2>
            <div className="inventory-cards">
              {menuItems.slice(0, 3).map(item => {
                const stock = inventory[item.id] ?? 0
                const statusText =
                  stock === 0 ? '품절' : stock < 5 ? '주의' : '정상'
                const statusClass =
                  stock === 0 ? 'out' : stock < 5 ? 'warn' : 'ok'
                return (
                  <div key={item.id} className="inventory-card">
                    <div className="inventory-card-header">
                      <span className="inventory-name">{item.name}</span>
                      <span className={`inventory-status inventory-status--${statusClass}`}>
                        {statusText}
                      </span>
                    </div>
                    <div className="inventory-stock">{stock}개</div>
                    <div className="inventory-controls">
                      <button
                        type="button"
                        className="inventory-btn inventory-btn--minus"
                        onClick={() => updateInventory(item.id, -1)}
                        disabled={stock <= 0}
                        aria-label={`${item.name} 재고 감소`}
                      >
                        -
                      </button>
                      <button
                        type="button"
                        className="inventory-btn inventory-btn--plus"
                        onClick={() => updateInventory(item.id, 1)}
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

          {/* 주문 현황 */}
          <section className="admin-orders">
            <h2 className="admin-section-title">주문 현황</h2>
            {orders.length === 0 ? (
              <p className="admin-empty">접수된 주문이 없습니다.</p>
            ) : (
              <div className="order-list">
                {orders.map(order => {
                  const date = new Date(order.createdAt)
                  const dateStr = `${date.getMonth() + 1}월 ${date.getDate()}일`
                  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
                  return (
                    <div key={order.id} className="order-card">
                      <div className="order-card-header">
                        <span className="order-datetime">
                          {dateStr} {timeStr}
                        </span>
                        <span className={`order-badge order-badge--${order.status === '완료' ? 'complete' : order.status === '제조중' ? 'making' : 'received'}`}>
                          {order.status}
                        </span>
                      </div>
                      <div className="order-items">
                        {order.items.map((line, i) => (
                          <div
                            key={`${order.id}-${line.name}-${line.options ?? ''}-${line.quantity}-${i}`}
                            className="order-item-line"
                          >
                            {line.name}
                            {line.options ? ` (${line.options})` : ''} × {line.quantity} — {line.subtotal.toLocaleString()}원
                          </div>
                        ))}
                      </div>
                      <div className="order-card-footer">
                        <span className="order-total">
                          총 금액 {order.totalAmount.toLocaleString()}원
                        </span>
                        {order.status === '주문접수' && (
                          <button
                            type="button"
                            className="order-action-btn"
                            onClick={() => startManufacturing(order.id)}
                            aria-label="제조 시작"
                          >
                            제조 시작
                          </button>
                        )}
                        {order.status === '제조중' && (
                          <button
                            type="button"
                            className="order-action-btn order-action-btn--complete"
                            onClick={() => completeOrder(order.id)}
                            aria-label="제조 완료"
                          >
                            제조 완료
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

// 메뉴 아이템 카드 컴포넌트
function MenuItemCard({ item, options, inventory = {}, onAddToCart }) {
  const [selectedOptions, setSelectedOptions] = useState(
    options.map(opt => ({ ...opt, selected: false }))
  )

  // 재고가 있는 메뉴만 담기 가능 (재고 키가 없으면 품절 아님)
  const hasStock = inventory[item.id] === undefined || inventory[item.id] > 0
  const isOutOfStock = inventory[item.id] !== undefined && inventory[item.id] <= 0

  const handleOptionChange = (optionId) => {
    setSelectedOptions(selectedOptions.map(opt =>
      opt.id === optionId ? { ...opt, selected: !opt.selected } : opt
    ))
  }

  const handleAddToCart = () => {
    if (!hasStock) return
    onAddToCart(item, selectedOptions)
    // 옵션 초기화
    setSelectedOptions(options.map(opt => ({ ...opt, selected: false })))
  }

  return (
    <div className={`menu-card ${isOutOfStock ? 'menu-card--out' : ''}`}>
      <div className="menu-image">
        {item.image ? (
          <img 
            src={item.image} 
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
          style={{ display: item.image ? 'none' : 'flex' }}
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
          {selectedOptions.map(option => (
            <label key={option.id} className="option-checkbox">
              <input
                type="checkbox"
                checked={option.selected}
                onChange={() => handleOptionChange(option.id)}
                disabled={isOutOfStock}
              />
              <span>
                {option.name} ({option.price > 0 ? `+${option.price.toLocaleString()}원` : '+0원'})
              </span>
            </label>
          ))}
        </div>
        <button
          type="button"
          className="add-to-cart-button"
          onClick={handleAddToCart}
          disabled={isOutOfStock}
          aria-label={isOutOfStock ? `${item.name} 품절` : `${item.name} 장바구니에 담기`}
        >
          {isOutOfStock ? '품절' : '담기'}
        </button>
      </div>
    </div>
  )
}

export default App
