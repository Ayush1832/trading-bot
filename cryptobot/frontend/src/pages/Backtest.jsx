import { useState } from 'react'
import BacktestForm from '../components/BacktestForm.jsx'
import BacktestResults from '../components/BacktestResults.jsx'

export default function Backtest() {
  const [result, setResult] = useState(null)

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold">Backtesting</h2>
      <BacktestForm onResult={setResult} />
      {result && <BacktestResults result={result} />}
    </div>
  )
}
