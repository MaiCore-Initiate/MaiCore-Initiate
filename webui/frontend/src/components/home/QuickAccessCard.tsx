const cardStyle = "bg-white border-2 border-[#797979] rounded-[30px] backdrop-blur-[50px] p-6 flex flex-col"
const cardShadow = { boxShadow: '8px 8px 12px rgba(0,0,0,0.57)' }
const titleStyle = { fontSize: 40, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif", filter: 'drop-shadow(1px 1px 1px rgba(0,0,0,0.3))' }
const btnStyle = "flex-1 py-4 rounded-[20px] border-2 border-black/30 text-black/60 hover:border-black/50 hover:text-black/80 transition-all cursor-pointer text-center"

export default function QuickAccessCard() {
  return (
    <div className={cardStyle} style={cardShadow}>
      <h2 className="text-black/80 mb-4" style={titleStyle}>快捷访问</h2>
      <div className="flex gap-4 mt-auto">
        {['组件下载', '注册实例', '编辑实例配置'].map(label => (
          <button key={label} className={btnStyle} style={{ fontSize: 20, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
