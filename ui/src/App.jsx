import { useState } from 'react'
import './App.css'

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

  // 장바구니 상태
  const [cart, setCart] = useState([])
  const [currentPage, setCurrentPage] = useState('order')

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

  // 수량 감소
  const decreaseQuantity = (itemId) => {
    setCart(cart.map(item =>
      item.id === itemId
        ? { ...item, quantity: Math.max(1, item.quantity - 1) }
        : item
    ))
  }

  // 총 금액 계산
  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)

  // 주문하기
  const handleOrder = () => {
    if (cart.length === 0) {
      alert('장바구니가 비어있습니다.')
      return
    }
    alert(`주문이 완료되었습니다!\n총 금액: ${totalAmount.toLocaleString()}원`)
    setCart([])
  }

  return (
    <div className="app">
      {/* 헤더 영역 */}
      <header className="header">
        <div className="brand">COZY</div>
        <nav className="navigation">
          <button
            className={`nav-button ${currentPage === 'order' ? 'active' : ''}`}
            onClick={() => setCurrentPage('order')}
          >
            주문하기
          </button>
          <button
            className={`nav-button ${currentPage === 'admin' ? 'active' : ''}`}
            onClick={() => setCurrentPage('admin')}
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
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
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
                            className="quantity-button"
                            onClick={() => decreaseQuantity(item.id)}
                          >
                            -
                          </button>
                          <span className="cart-item-quantity">{item.quantity}</span>
                          <button
                            className="quantity-button"
                            onClick={() => increaseQuantity(item.id)}
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
                  <button className="order-button" onClick={handleOrder}>
                    주문하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 관리자 화면 (추후 구현) */}
      {currentPage === 'admin' && (
        <div className="admin-section">
          <p>관리자 화면은 추후 구현 예정입니다.</p>
        </div>
      )}
    </div>
  )
}

// 메뉴 아이템 카드 컴포넌트
function MenuItemCard({ item, options, onAddToCart }) {
  const [selectedOptions, setSelectedOptions] = useState(
    options.map(opt => ({ ...opt, selected: false }))
  )

  const handleOptionChange = (optionId) => {
    setSelectedOptions(selectedOptions.map(opt =>
      opt.id === optionId ? { ...opt, selected: !opt.selected } : opt
    ))
  }

  const handleAddToCart = () => {
    onAddToCart(item, selectedOptions)
    // 옵션 초기화
    setSelectedOptions(options.map(opt => ({ ...opt, selected: false })))
  }

  return (
    <div className="menu-card">
      <div className="menu-image">
        {item.image ? (
          <img 
            src={item.image} 
            alt={item.name}
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
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
        <p className="menu-price">{item.price.toLocaleString()}원</p>
        <p className="menu-description">{item.description}</p>
        <div className="menu-options">
          {selectedOptions.map(option => (
            <label key={option.id} className="option-checkbox">
              <input
                type="checkbox"
                checked={option.selected}
                onChange={() => handleOptionChange(option.id)}
              />
              <span>
                {option.name} ({option.price > 0 ? `+${option.price.toLocaleString()}원` : '+0원'})
              </span>
            </label>
          ))}
        </div>
        <button className="add-to-cart-button" onClick={handleAddToCart}>
          담기
        </button>
      </div>
    </div>
  )
}

export default App
