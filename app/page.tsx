"use client";

import { useState, useMemo, useEffect } from "react";
import Confetti from "react-confetti";
import { useWindowSize } from "react-use"; 
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import { 
  GraduationCap, Activity, Home, Plane, Star, 
  ShieldCheck, Scale, Hourglass, Zap, 
  Wallet, Plus, X, AlertCircle, Lightbulb, Target, PauseCircle,
  TrendingUp, TrendingDown
} from "lucide-react";

import {
  calculateFutureGoalValue,
  calculateRequiredSIP,
} from "../lib/formulas";

/*CONSTANTS & STYLING */

const GOAL_PRESETS = {
  Education: { inflation: 0.08, Icon: GraduationCap },
  Medical: { inflation: 0.10, Icon: Activity },
  Home: { inflation: 0.06, Icon: Home },
  Travel: { inflation: 0.07, Icon: Plane },
  Other: { inflation: 0.06, Icon: Star },
};

const CHART_COLORS = ["#224c87", "#da3832", "#64748b", "#cbd5e1", "#475569"];

type GoalKey = keyof typeof GOAL_PRESETS;
type Goal = { id: number; name: GoalKey; presentCost: number; years: number; };

const INITIAL_GOAL: Goal = { id: 1, name: "Home", presentCost: 5000000, years: 10 };

const formatCurrencyShort = (num: number) => {
  if (num >= 10000000) return (num / 10000000).toFixed(2) + " Cr";
  if (num >= 100000) return (num / 100000).toFixed(2) + " Lac";
  return "₹" + num.toLocaleString("en-IN");
};

const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-[#224c87]/30 rounded-xl shadow-lg" role="tooltip">
        <p className="font-black text-[#224c87] text-xs uppercase tracking-widest mb-1">{payload[0].name}</p>
        <p className="font-bold text-black text-sm">₹{Math.round(payload[0].value).toLocaleString("en-IN")}</p>
      </div>
    );
  }
  return null;
};

export default function UltimateGoalPlanner() {
  const { width, height } = useWindowSize();
  
  const [goals, setGoals] = useState<Goal[]>([INITIAL_GOAL]);
  const [annualReturn, setAnnualReturn] = useState(0.12);
  const [taxRate, setTaxRate] = useState(0.1);
  const [showPostTax, setShowPostTax] = useState(true);
  const [scenario, setScenario] = useState<"low" | "base" | "high">("base");
  
  const [monthlyBudget, setMonthlyBudget] = useState(50000);
  const [showConfetti, setShowConfetti] = useState(false);
  
  // Delay State 
  const [delayYears, setDelayYears] = useState(0);
  const [extraYears, setExtraYears] = useState(0);

  const resetAll = () => {
    setGoals([{ ...INITIAL_GOAL, id: Date.now() }]);
    setAnnualReturn(0.12);
    setTaxRate(0.1);
    setShowPostTax(true);
    setDelayYears(0);
    setExtraYears(0);
    setScenario("base");
    setMonthlyBudget(50000);
  };

  const handleTabKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const nextState = !showPostTax;
      setShowPostTax(nextState);
      setTimeout(() => {
        const targetId = nextState ? "tab-post-tax" : "tab-pre-tax";
        document.getElementById(targetId)?.focus();
      }, 0);
    }
  };

  const calculateFVofAnnuity = (monthlyInvestment: number, annualRate: number, years: number) => {
    const r = annualRate / 12;
    const n = years * 12;
    return monthlyInvestment * ((Math.pow(1 + r, n) - 1) / r);
  };

  const calculations = useMemo(() => {
    let totalFV = 0;
    let totalInvestedPostTax = 0;
    
    //   Variables for Delay Calculations 
    let totalDelayedPostTaxSIP = 0;
    let totalDelayedPreTaxSIP = 0;
    let sipIf5YearsEarlier = 0;

    const adjustedReturn = scenario === "low" ? annualReturn - 0.03 : scenario === "high" ? annualReturn + 0.03 : annualReturn;
    const baseMaxYears = Math.max(...goals.map((g) => g.years));
    const maxYears = baseMaxYears + extraYears;
    const shortestGoalYears = Math.min(...goals.map(g => g.years));
    const maxPossibleDelay = Math.max(0, shortestGoalYears + extraYears - 1);
    const safeDelay = Math.min(delayYears, maxPossibleDelay);

    const goalBreakdown = goals.map((g) => {
      const inflation = GOAL_PRESETS[g.name].inflation;
      const adjustedYears = Math.max(1, g.years) + extraYears;
      const fv = calculateFutureGoalValue(g.presentCost, inflation, adjustedYears);
      totalFV += fv;
      
      const preTaxSIP = calculateRequiredSIP(fv, adjustedReturn, adjustedYears);
      const postTaxSIP = calculateRequiredSIP(fv, adjustedReturn * (1 - taxRate), adjustedYears);
      
      const earlierYears = adjustedYears + 5;
      const earlierFV = calculateFutureGoalValue(g.presentCost, inflation, earlierYears);
      const earlierSIP = calculateRequiredSIP(earlierFV, adjustedReturn * (1 - taxRate), earlierYears);
      sipIf5YearsEarlier += earlierSIP;

      totalInvestedPostTax += postTaxSIP * adjustedYears * 12;

      //  Calculate delayed SIP 
      const remainingYears = Math.max(1, adjustedYears - safeDelay);
      totalDelayedPostTaxSIP += calculateRequiredSIP(fv, adjustedReturn * (1 - taxRate), remainingYears);
      totalDelayedPreTaxSIP += calculateRequiredSIP(fv, adjustedReturn, remainingYears);

      return { ...g, value: fv, preTaxSIP, postTaxSIP, adjustedYears, inflation };
    });

    const preTaxSIP = Math.round(goalBreakdown.reduce((sum, g) => sum + g.preTaxSIP, 0));
    const postTaxSIP = Math.round(goalBreakdown.reduce((sum, g) => sum + g.postTaxSIP, 0));
    
    const activeSIP = showPostTax ? postTaxSIP : preTaxSIP;
    
    //  Cost of Delay Math
    const activeDelayedSIP = showPostTax ? totalDelayedPostTaxSIP : totalDelayedPreTaxSIP;
    const costOfDelay = Math.round(activeDelayedSIP - activeSIP);

    //  Lost Potential Growth Math
    const activeReturnRate = showPostTax ? adjustedReturn * (1 - taxRate) : adjustedReturn;
    const fvIfDelayedWithSameSIP = calculateFVofAnnuity(activeSIP, activeReturnRate, Math.max(1, maxYears - safeDelay));
    const lostGrowth = Math.max(0, Math.round(totalFV - fvIfDelayedWithSameSIP));

    const readinessScore = activeSIP > 0 ? Math.min(100, Math.round((monthlyBudget / activeSIP) * 100)) : 0;
    
    const lowReturnRate = Math.max(0.04, adjustedReturn - 0.04);
    const highReturnRate = adjustedReturn + 0.03;
    
    const fvAtLow = calculateFVofAnnuity(activeSIP, showPostTax ? lowReturnRate * (1 - taxRate) : lowReturnRate, maxYears);
    const fvAtHigh = calculateFVofAnnuity(activeSIP, showPostTax ? highReturnRate * (1 - taxRate) : highReturnRate, maxYears);

    return { 
      totalFV, maxYears, maxPossibleDelay, adjustedReturn, activeSIP,
      preTaxSIP, postTaxSIP, totalInvestedPostTax, goalBreakdown, 
      readinessScore, costOfDelay, lostGrowth, activeDelayedSIP, sipIf5YearsEarlier,
      lowReturnRate, highReturnRate, fvAtLow, fvAtHigh
    };
  }, [goals, annualReturn, taxRate, delayYears, scenario, extraYears, showPostTax, monthlyBudget]);

  const { 
    totalFV, maxYears, maxPossibleDelay, adjustedReturn, activeSIP, preTaxSIP, postTaxSIP, 
    totalInvestedPostTax, goalBreakdown, readinessScore, costOfDelay, lostGrowth, activeDelayedSIP, 
    sipIf5YearsEarlier, lowReturnRate, highReturnRate, fvAtLow, fvAtHigh 
  } = calculations;

  useEffect(() => {
    if (readinessScore >= 100) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowConfetti(false);
    }
  }, [readinessScore]);

  const chartData = useMemo(() => {
    const data = [];
    const rPre = adjustedReturn / 12;
    const rPost = (adjustedReturn * (1 - taxRate)) / 12;
    let preVal = 0; let postVal = 0; let invested = 0;
    
    for (let yr = 1; yr <= maxYears; yr++) {
      for (let i = 0; i < 12; i++) {
        preVal = (preVal + preTaxSIP) * (1 + rPre);
        postVal = (postVal + postTaxSIP) * (1 + rPost);
        invested += activeSIP;
      }
      data.push({ 
        year: `Yr ${yr}`, 
        Invested: Math.round(invested),
        ReturnsPre: Math.max(0, Math.round(preVal - invested)), 
        ReturnsPost: Math.max(0, Math.round(postVal - invested))
      });
    }
    return data;
  }, [maxYears, adjustedReturn, taxRate, preTaxSIP, postTaxSIP, activeSIP]);

  const handlePrint = () => {
    window.print();
  };

  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const stopSimInvested = activeSIP * 12 * 10; 
  const stopSimFVYear10 = calculateFVofAnnuity(activeSIP, adjustedReturn, 10);
  const stopSimFVYear30 = stopSimFVYear10 * Math.pow(1 + adjustedReturn, 20); 

  return (
    <main className="min-h-screen bg-[#F8FAFC] py-10 px-4 md:px-10 font-sans relative print:bg-white print:py-0 print:px-0">
      
      <div className="print:hidden" aria-hidden="true">
        {showConfetti && <Confetti width={width} height={height} recycle={false} numberOfPieces={500} colors={["#224c87", "#da3832", "#64748b", "#ffffff"]} />}
      </div>
      
     <div className="max-w-7xl mx-auto space-y-10 print:hidden">
        
        {/* TOP BAR */}
        <header className="flex flex-col md:flex-row justify-between items-center gap-6">
          
          <div className="flex flex-col gap-1 md:items-start items-center">
            <h1 className="text-2xl md:text-3xl font-black text-[#224c87] tracking-tight">
              FinPlan Pro
            </h1>
            <p className="text-slate-500 font-bold text-[10px] md:text-xs uppercase tracking-[0.2em] flex items-center gap-3">
              <span className="w-8 h-[2px] bg-[#da3832]" aria-hidden="true"></span>
              Investor Education Initiative
            </p>
          </div>

          <nav className="flex gap-4" aria-label="Utility Actions">
            <button aria-label="Reset all inputs" onClick={resetAll} className="px-6 py-3 border border-slate-300 text-[#224c87] font-black text-[10px] rounded-full hover:bg-[#224c87]/5 transition-all uppercase tracking-widest bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#224c87]">Reset</button>
            <button aria-label="Download Summary as PDF" onClick={handlePrint} className="px-6 py-3 bg-[#da3832] text-white font-black text-[10px] rounded-full hover:brightness-110 transition-all uppercase tracking-widest shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#da3832]">Download Summary</button>
          </nav>
        </header>

        {/* HERO SECTION */}
        <section aria-labelledby="hero-heading" className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="max-w-xl">
            <h1 id="hero-heading" className="text-3xl md:text-5xl font-black text-[#224c87] mb-4 flex items-center gap-4">
              Your Financial Journey
            </h1>
            <p className="text-slate-600 font-medium leading-relaxed">
              Match your budget to your goals. Hit 100% on your Readiness Score to ensure you are fully funded for the future.
            </p>
            
            <div className="mt-8 bg-slate-50 p-6 rounded-3xl border border-slate-200">
              <label htmlFor="monthly-budget" className="text-[10px] font-black uppercase tracking-widest text-[#224c87] block mb-4">Your Monthly Investment Capacity (₹)</label>
              <input 
                id="monthly-budget"
                type="range" min="5000" max={Math.max(200000, activeSIP * 1.5)} step="5000" 
                value={monthlyBudget} onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                aria-valuemin={5000} aria-valuemax={Math.max(200000, activeSIP * 1.5)} aria-valuenow={monthlyBudget}
                className="w-full h-2 accent-[#da3832] bg-slate-300 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#da3832]"
              />
              <div className="flex justify-between mt-3 font-black text-[#224c87]" aria-hidden="true">
                <span>₹5,000</span>
                <span className="text-xl text-[#da3832] bg-white px-4 py-1 rounded-full shadow-sm border border-slate-100">₹{monthlyBudget.toLocaleString("en-IN")}</span>
                <span>Max</span>
              </div>
            </div>
          </div>

          <div className="relative flex flex-col items-center">
             <div 
               role="progressbar" 
               aria-valuenow={readinessScore} 
               aria-valuemin={0} 
               aria-valuemax={100} 
               aria-label={`Financial Readiness Score: ${readinessScore}%`}
               className="w-48 h-48 md:w-56 md:h-56 rounded-full border-[12px] border-slate-100 flex items-center justify-center relative bg-white shadow-inner"
             >
                <svg className="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true">
                  <circle cx="50%" cy="50%" r="42%" fill="none" stroke={readinessScore >= 100 ? "#224c87" : readinessScore > 50 ? "#64748b" : "#da3832"} strokeWidth="12" strokeDasharray="1000" strokeDashoffset={1000 - (1000 * readinessScore) / 100} className="transition-all duration-1000 ease-out" />
                </svg>
                <div className="text-center z-10" aria-hidden="true">
                  <span className="text-5xl md:text-6xl font-black text-[#224c87]">{readinessScore}%</span>
                  <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Ready</p>
                </div>
             </div>
          </div>
        </section>

        {/* DYNAMIC INSIGHT BANNER */}
        <section aria-label="Actionable Insight" className="bg-gradient-to-r from-[#224c87] to-[#1e3a8a] rounded-2xl p-4 md:p-5 shadow-lg flex items-center gap-4 text-white transform hover:scale-[1.01] transition-transform">
          <div className="bg-white/20 p-3 rounded-full shrink-0" aria-hidden="true">
            <Lightbulb className="text-yellow-300 w-6 h-6" />
          </div>
          <div>
            <h4 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-white/80 mb-1">Actionable Insight</h4>
            <p className="text-sm md:text-base font-medium">
              If you had started just <strong>5 years earlier</strong>, your required SIP would drop by <strong className="text-yellow-300 text-lg">₹{Math.round(activeSIP - sipIf5YearsEarlier).toLocaleString("en-IN")}</strong> per month. Time is your biggest asset.
            </p>
          </div>
        </section>

        {/* ==================================================
          STACKED & SMOOTH SCROLLING SECTIONS 
          ==================================================
        */}
        <div className="flex flex-col gap-10">

          {/* ROW 1: INPUTS (Goals, Risk, Timelines) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* GOALS */}
            <section aria-labelledby="goals-heading" className="bg-white rounded-[2rem] p-6 md:p-8 shadow-lg border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                <h2 id="goals-heading" className="font-black text-[#224c87] text-sm uppercase tracking-widest">Your Goals</h2>
                <button aria-label="Add a new financial goal" onClick={() => setGoals([...goals, { id: Date.now(), name: "Travel", presentCost: 200000, years: 3 }])} className="flex items-center bg-[#224c87] text-white text-[10px] font-black px-4 py-2 rounded-full hover:scale-105 transition-transform shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#224c87]">
                  <Plus size={14} className="mr-1" aria-hidden="true" /> ADD
                </button>
              </div>

              <fieldset className="space-y-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar border-none p-0 m-0">
                <legend className="sr-only">List of your financial goals</legend>
                {goals.map((goal) => {
                  const GoalIcon = GOAL_PRESETS[goal.name].Icon;
                  return (
                    <article key={goal.id} className="p-5 rounded-2xl bg-slate-50 border border-slate-200 relative group">
                      {goals.length > 1 && (
                        <button aria-label={`Remove ${goal.name} goal`} onClick={() => setGoals(goals.filter(g => g.id !== goal.id))} className="absolute top-3 right-3 text-slate-400 hover:text-[#da3832] transition-colors p-1 focus:outline-none focus:ring-2 focus:ring-[#da3832] rounded-md"><X size={16} strokeWidth={3} aria-hidden="true" /></button>
                      )}
                      <GoalIcon className="w-7 h-7 mb-3 text-[#224c87]" aria-hidden="true" />
                      
                      <label htmlFor={`goal-type-${goal.id}`} className="sr-only">Goal Type</label>
                      <select id={`goal-type-${goal.id}`} value={goal.name} onChange={(e) => setGoals(goals.map(g => g.id === goal.id ? {...g, name: e.target.value as GoalKey} : g))} className="bg-transparent font-black text-[#224c87] outline-none mb-3 block w-full cursor-pointer focus:ring-2 focus:ring-[#224c87] rounded-md">
                        {Object.keys(GOAL_PRESETS).map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                      
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label htmlFor={`cost-${goal.id}`} className="text-[9px] font-black text-slate-600 uppercase block mb-1">Cost (₹)</label>
                            <input id={`cost-${goal.id}`} type="number" value={goal.presentCost} onChange={(e) => setGoals(goals.map(g => g.id === goal.id ? {...g, presentCost: Math.max(0, Number(e.target.value))} : g))} className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold text-black shadow-sm outline-none focus:border-[#224c87] focus:ring-1 focus:ring-[#224c87]" />
                         </div>
                         <div>
                            <label htmlFor={`years-${goal.id}`} className="text-[9px] font-black text-slate-600 uppercase block mb-1">Years</label>
                            <input id={`years-${goal.id}`} type="number" min="1" max="50" value={goal.years} onChange={(e) => setGoals(goals.map(g => g.id === goal.id ? {...g, years: Math.max(1, Number(e.target.value))} : g))} className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold text-black shadow-sm outline-none focus:border-[#224c87] focus:ring-1 focus:ring-[#224c87]" />
                         </div>
                      </div>
                    </article>
                  );
                })}
              </fieldset>
            </section>

            {/* RISK & SLIDERS */}
            <div className="flex flex-col gap-8">
              <section aria-labelledby="risk-profile-heading" className="bg-white rounded-[2rem] p-6 shadow-lg border border-slate-200">
                 <h3 id="risk-profile-heading" className="font-black text-[#224c87] text-xs uppercase mb-4 tracking-widest">Risk Profile</h3>
                 <div role="radiogroup" aria-labelledby="risk-profile-heading" className="grid grid-cols-3 gap-2">
                    <button aria-pressed={scenario === 'low'} onClick={() => setScenario("low")} className={`p-3 rounded-2xl flex flex-col items-center gap-2 border-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#224c87] ${scenario === 'low' ? 'border-[#224c87] bg-[#224c87]/5 shadow-sm text-[#224c87]' : 'border-transparent bg-slate-50 text-slate-500 hover:text-slate-700'}`}><ShieldCheck size={24} aria-hidden="true" /><span className="text-[9px] font-black uppercase mt-1 text-inherit">Safe</span></button>
                    <button aria-pressed={scenario === 'base'} onClick={() => setScenario("base")} className={`p-3 rounded-2xl flex flex-col items-center gap-2 border-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#224c87] ${scenario === 'base' ? 'border-[#224c87] bg-[#224c87]/5 shadow-sm text-[#224c87]' : 'border-transparent bg-slate-50 text-slate-500 hover:text-slate-700'}`}><Scale size={24} aria-hidden="true" /><span className="text-[9px] font-black uppercase mt-1 text-inherit">Mod</span></button>
                    <button aria-pressed={scenario === 'high'} onClick={() => setScenario("high")} className={`p-3 rounded-2xl flex flex-col items-center gap-2 border-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#224c87] ${scenario === 'high' ? 'border-[#224c87] bg-[#224c87]/5 shadow-sm text-[#224c87]' : 'border-transparent bg-slate-50 text-slate-500 hover:text-slate-700'}`}><TrendingUp size={24} aria-hidden="true" /><span className="text-[9px] font-black uppercase mt-1 text-inherit">Aggr</span></button>
                 </div>
              </section>
              
              <section aria-label="Timeline Adjustments" className="bg-white rounded-[2rem] p-6 shadow-lg border border-slate-200 space-y-6">
                 <div>
                    <label htmlFor="extend-horizon" className="flex justify-between items-center text-[10px] font-black text-[#224c87] mb-3 uppercase tracking-wider">
                      Extend Horizon <span className="text-xs bg-[#224c87]/10 px-2 py-1 rounded-md" aria-hidden="true">+{extraYears} Yrs</span>
                    </label>
                    <input id="extend-horizon" type="range" min="0" max="15" step="1" value={extraYears} onChange={(e) => setExtraYears(Number(e.target.value))} 
                      aria-valuemin={0} aria-valuemax={15} aria-valuenow={extraYears} 
                      className="w-full h-1.5 accent-[#224c87] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#224c87]" />
                 </div>
                 <div className="pt-4 border-t border-slate-100">
                    <label htmlFor="delay-investing" className="flex justify-between items-center text-[10px] font-black text-[#da3832] mb-3 uppercase tracking-wider">
                      Start Investing After <span className="text-xs bg-[#da3832]/10 px-2 py-1 rounded-md" aria-hidden="true">{delayYears} Yrs</span>
                    </label>
                    <input id="delay-investing" type="range" min="0" max={Math.max(1, maxPossibleDelay)} step="1" value={Math.min(delayYears, maxPossibleDelay)} onChange={(e) => setDelayYears(Number(e.target.value))} disabled={maxPossibleDelay === 0} 
                      aria-valuemin={0} aria-valuemax={Math.max(1, maxPossibleDelay)} aria-valuenow={Math.min(delayYears, maxPossibleDelay)}
                      className={`w-full h-1.5 accent-[#da3832] focus:outline-none focus:ring-2 focus:ring-[#da3832] ${maxPossibleDelay === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`} />
                 </div>
              </section>
            </div>
          </div>

          {/* ROW 2: MAIN RESULTS CARD */}
          <section aria-label="Main Results Dashboard" className="bg-[#224c87] rounded-[2.5rem] p-8 md:p-10 text-white shadow-2xl relative overflow-hidden w-full">
            <div className="relative z-10 flex flex-col justify-between h-full">
              <div role="tablist" aria-label="Tax Calculation Selection" className="flex bg-white/10 p-1.5 rounded-2xl w-fit mb-8" onKeyDown={handleTabKey}>
                <button id="tab-pre-tax" role="tab" aria-selected={!showPostTax} aria-controls="panel-results" tabIndex={!showPostTax ? 0 : -1} onClick={() => setShowPostTax(false)} className={`px-6 py-2 rounded-xl text-[10px] font-black transition-all focus:outline-none focus:ring-2 focus:ring-white ${!showPostTax ? 'bg-white text-[#224c87] shadow-sm' : 'text-white/70 hover:text-white'}`}>PRE-TAX</button>
                <button id="tab-post-tax" role="tab" aria-selected={showPostTax} aria-controls="panel-results" tabIndex={showPostTax ? 0 : -1} onClick={() => setShowPostTax(true)} className={`px-6 py-2 rounded-xl text-[10px] font-black transition-all focus:outline-none focus:ring-2 focus:ring-white ${showPostTax ? 'bg-[#da3832] text-white shadow-md' : 'text-white/70 hover:text-white'}`}>POST-TAX</button>
              </div>

              <div id="panel-results" role="tabpanel" aria-labelledby={showPostTax ? "tab-post-tax" : "tab-pre-tax"}>
                 <p className="text-[11px] font-black uppercase tracking-[0.2em] opacity-80 mb-2">Required Monthly SIP</p>
                 <h2 className="text-5xl md:text-7xl font-black mb-6 tracking-tight tabular-nums" aria-live="polite">₹{activeSIP.toLocaleString("en-IN")}</h2>
              </div>
               
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-6 border-t border-white/20 mt-4">
                  <div className="bg-white/10 p-4 rounded-2xl">
                    <p className="text-[10px] font-black uppercase opacity-80 mb-1 tracking-widest">Target Wealth</p>
                    <p className="text-xl font-bold">{formatCurrencyShort(totalFV)}</p>
                  </div>
                  <div className="bg-white/10 p-4 rounded-2xl">
                    <p className="text-[10px] font-black uppercase opacity-80 mb-1 tracking-widest">Assumed Return</p>
                    <p className="text-xl font-bold">{Math.round(adjustedReturn * 100)}% <span className="text-xs opacity-70">p.a.</span></p>
                  </div>
                  <div className="bg-[#da3832]/80 p-4 rounded-2xl col-span-2 md:col-span-1">
                    <p className="text-[10px] font-black uppercase opacity-90 mb-1 tracking-widest flex items-center gap-1"><Target size={12} aria-hidden="true"/> Prob. of Success</p>
                    <p className="text-xl font-bold">{fvAtLow >= totalFV ? "Very High" : (activeSIP * 12 * maxYears >= totalFV ? "Guaranteed" : "Realistic")}</p>
                  </div>
              </div>
            </div>
          </section>

          {/* ROW 3: COST OF DELAY ALERT */}
          {delayYears > 0 && (
            <div role="alert" aria-live="polite" className="bg-[#fff1f2] border border-[#fecdd3] rounded-[2rem] p-6 shadow-md transition-all duration-500 ease-in-out">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="text-[#da3832] w-6 h-6" aria-hidden="true" />
                <h3 className="font-black text-[#da3832] text-sm uppercase tracking-widest">The Cost of Waiting</h3>
              </div>
              <p className="text-xs text-[#da3832] font-semibold mb-5 leading-relaxed">
                Waiting <span className="font-black text-sm">{delayYears} years</span> significantly increases the monthly investment required because you are missing out on the compounding effect.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-[#ffe4e6] shadow-sm flex flex-col justify-center">
                  <p className="text-[10px] font-black text-slate-600 uppercase mb-2 tracking-widest">Extra SIP Needed</p>
                  <p className="text-2xl font-black text-[#da3832] flex items-center gap-2">
                    <TrendingUp size={24} className="text-[#da3832]" aria-hidden="true" />
                    +₹{costOfDelay.toLocaleString("en-IN")}<span className="text-xs text-slate-500">/mo</span>
                  </p>
                </div>
                
                <div className="bg-white p-5 rounded-2xl border border-[#ffe4e6] shadow-sm flex flex-col justify-center">
                  <p className="text-[10px] font-black text-slate-600 uppercase mb-2 tracking-widest">Lost Potential Growth</p>
                  <p className="text-2xl font-black text-[#da3832] flex items-center gap-2">
                     <TrendingDown size={24} className="text-[#da3832]" aria-hidden="true" />
                     {formatCurrencyShort(lostGrowth)}
                  </p>
                  <p className="text-[9px] text-slate-500 font-bold mt-2 uppercase tracking-wide">If you invested the original SIP for {maxYears - delayYears} yrs</p>
                </div>
              </div>
            </div>
          )}

          {/* ROW 4: SECONDARY METRICS & PIE CHART */}
          {/* Dynamic grid: Adjusts to 3 columns if pie chart is active, 2 columns if hidden */}
          <div className={`grid grid-cols-1 md:grid-cols-2 ${goals.length > 1 ? 'lg:grid-cols-3' : ''} gap-8`}>
            
            <section aria-labelledby="prob-heading" className="bg-white p-6 rounded-[2rem] shadow-md border-l-8 border-[#224c87] border border-slate-200">
               <Target className="w-8 h-8 mb-3 text-[#224c87]" aria-hidden="true" />
               <h4 id="prob-heading" className="font-black text-[#224c87] text-xs uppercase tracking-widest mb-3">Goal Success Probability</h4>
               <p className="text-[10px] font-medium text-slate-600 mb-4">Markets are unpredictable. If you invest exactly ₹{activeSIP.toLocaleString("en-IN")}/mo, will you still hit your goal?</p>
               
               <div className="space-y-3">
                 <div className="flex justify-between items-center text-xs font-bold bg-slate-50 p-3 rounded-lg border border-slate-100">
                   <span className="text-slate-700">Low Return ({Math.round(lowReturnRate * 100)}%)</span>
                   <span className={fvAtLow >= totalFV ? "text-[#224c87] font-black" : "text-slate-500 font-black"}>
                     {fvAtLow >= totalFV ? "✓ Meet Goal" : "✗ Miss Goal"}
                   </span>
                 </div>
                 <div className="flex justify-between items-center text-xs font-bold bg-[#224c87]/5 border border-[#224c87]/20 p-3 rounded-lg">
                   <span className="text-[#224c87]">Expected ({Math.round(adjustedReturn * 100)}%)</span>
                   <span className="text-[#224c87] font-black">✓ Meet Goal</span>
                 </div>
                 <div className="flex justify-between items-center text-xs font-bold bg-slate-50 p-3 rounded-lg border border-slate-100">
                   <span className="text-slate-700">High Return ({Math.round(highReturnRate * 100)}%)</span>
                   <span className="text-[#224c87] font-black">✓ Exceed Goal</span>
                 </div>
               </div>
            </section>
            
            <section aria-labelledby="wealth-breakdown-heading" className="bg-white p-6 rounded-[2rem] shadow-md border-l-8 border-slate-400 flex flex-col justify-center border border-slate-200">
               <Wallet className="w-8 h-8 mb-3 text-slate-500" aria-hidden="true" />
               <h4 id="wealth-breakdown-heading" className="font-black text-slate-600 text-xs uppercase tracking-widest mb-3">Wealth Breakdown</h4>
               <p className="text-xs font-medium text-slate-600 mt-2 leading-relaxed mb-4">You invest **{formatCurrencyShort(totalInvestedPostTax)}**. <br/>The market generates **{formatCurrencyShort(totalFV - totalInvestedPostTax)}** in estimated wealth!</p>
               
               <div className="w-full h-3 bg-slate-200 rounded-full flex overflow-hidden" role="progressbar" aria-valuenow={(totalInvestedPostTax / totalFV) * 100} aria-valuemin={0} aria-valuemax={100} aria-label="Ratio of invested amount vs returns">
                 <div className="bg-slate-400 h-full" style={{width: `${(totalInvestedPostTax / totalFV) * 100}%`}}></div>
                 <div className="bg-[#224c87] h-full" style={{width: `${((totalFV - totalInvestedPostTax) / totalFV) * 100}%`}}></div>
               </div>
               <div className="flex justify-between text-[9px] font-black uppercase mt-1 text-slate-500" aria-hidden="true">
                 <span>Invested</span>
                 <span>Returns</span>
               </div>
            </section>

            {goals.length > 1 && (
              <section aria-labelledby="pie-chart-heading" className="bg-white rounded-[2rem] p-6 shadow-lg border border-slate-200 flex flex-col items-center justify-center">
                 <h3 id="pie-chart-heading" className="font-black text-[#224c87] text-xs uppercase tracking-widest w-full text-left mb-4">Target Wealth Distribution</h3>
                 <div className="w-full h-[200px]" aria-hidden="true"> 
                   <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                       <Pie data={goalBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={5} dataKey="value" stroke="none">
                         {goalBreakdown.map((entry, index) => (<Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />))}
                       </Pie>
                       <RechartsTooltip content={<CustomPieTooltip />} />
                       <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', paddingTop: '10px' }} />
                     </PieChart>
                   </ResponsiveContainer>
                 </div>
                 <div className="sr-only">
                   <table>
                     <caption>Target Wealth Distribution Data</caption>
                     <thead><tr><th scope="col">Goal Name</th><th scope="col">Target Value</th></tr></thead>
                     <tbody>{goalBreakdown.map((g, index) => (<tr key={index}><td>{g.name}</td><td>₹{Math.round(g.value).toLocaleString("en-IN")}</td></tr>))}</tbody>
                   </table>
                 </div>
              </section>
            )}
          </div>

          {/* ROW 5: MAIN AREA CHART */}
          <section aria-labelledby="area-chart-heading" className="bg-white rounded-[2rem] p-6 md:p-8 shadow-lg border border-slate-200 w-full">
            <div className="flex justify-between items-center mb-6">
              <h3 id="area-chart-heading" className="font-black text-[#224c87] text-sm uppercase tracking-widest">Investment vs Market Returns</h3>
              <div className="flex gap-3 text-[10px] font-bold uppercase text-slate-600">
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-slate-300 rounded-full" aria-hidden="true"></div> Out of Pocket</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-[#224c87] rounded-full" aria-hidden="true"></div> Market Growth</span>
              </div>
            </div>
            
            {/* FIXED EXPLICIT HEIGHT APPLIED HERE SO RECHARTS DOES NOT COLLAPSE */}
            <div className="w-full h-[350px]" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ left: 0, top: 10, right: 0, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                   <XAxis dataKey="year" fontSize={10} tick={{fill: '#64748b', fontWeight: 'bold'}} axisLine={false} tickLine={false}/>
                   <YAxis hide domain={['auto', 'auto']} />
                   <RechartsTooltip 
                     contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                     formatter={(value: number | string | undefined) => value !== undefined ? `₹${Number(value).toLocaleString("en-IN")}` : "₹0"}
                   />
                   <Area name="Your Investment" type="monotone" dataKey="Invested" stackId="1" stroke="#94a3b8" fill="#cbd5e1" strokeWidth={2} />
                   <Area name="Market Returns" type="monotone" dataKey={showPostTax ? "ReturnsPost" : "ReturnsPre"} stackId="1" stroke="#224c87" fill="#224c87" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="sr-only">
              <table>
                <caption>Investment vs Market Returns Data over Time</caption>
                <thead><tr><th scope="col">Year</th><th scope="col">Total Invested</th><th scope="col">Market Returns</th></tr></thead>
                <tbody>{chartData.map((data, index) => (<tr key={index}><td>{data.year}</td><td>₹{data.Invested.toLocaleString("en-IN")}</td><td>₹{showPostTax ? data.ReturnsPost.toLocaleString("en-IN") : data.ReturnsPre.toLocaleString("en-IN")}</td></tr>))}</tbody>
              </table>
            </div>
          </section>

          {/* ROW 6: SIMULATION INSIGHTS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section aria-labelledby="impact-heading" className="bg-white rounded-[2rem] p-6 shadow-lg border border-slate-200">
               <h4 id="impact-heading" className="text-xs font-black text-[#224c87] uppercase tracking-widest mb-3 flex items-center gap-2"><Zap size={16} aria-hidden="true"/> Impact of Starting Early</h4>
               <p className="text-[11px] font-medium text-slate-600 mb-5 leading-relaxed">
                 Starting 10 years earlier drastically increases wealth with the exact same monthly investment.
               </p>
               <div className="grid grid-cols-2 gap-4">
                 <div className="bg-[#224c87]/5 p-4 rounded-2xl border border-[#224c87]/10">
                   <p className="font-black text-[#224c87] uppercase text-[10px] tracking-widest mb-1">Starts at 22</p>
                   <p className="font-medium text-[10px] text-slate-500 mb-2">₹5k/mo for 30 yrs</p>
                   <p className="text-base font-black text-[#224c87]">
                     ₹{Math.round(calculateFVofAnnuity(5000, 0.12, 30)).toLocaleString("en-IN")}
                   </p>
                 </div>
                 <div className="bg-[#da3832]/5 p-4 rounded-2xl border border-[#da3832]/10">
                   <p className="font-black text-[#da3832] uppercase text-[10px] tracking-widest mb-1">Starts at 32</p>
                   <p className="font-medium text-[10px] text-slate-500 mb-2">₹5k/mo for 20 yrs</p>
                   <p className="text-base font-black text-[#da3832]">
                     ₹{Math.round(calculateFVofAnnuity(5000, 0.12, 20)).toLocaleString("en-IN")}
                   </p>
                 </div>
               </div>
            </section>

            <section aria-labelledby="stop-sim-heading" className="bg-slate-50 rounded-[2rem] p-6 shadow-md border border-slate-200 relative overflow-hidden">
               <div className="absolute -right-4 -top-4 opacity-5" aria-hidden="true"><PauseCircle size={100} /></div>
               <h4 id="stop-sim-heading" className="text-xs font-black text-slate-800 uppercase tracking-widest mb-3 relative z-10 flex items-center gap-2">
                 <PauseCircle size={16} className="text-[#da3832]" aria-hidden="true"/> What If You Stop Early?
               </h4>
               <p className="text-[11px] font-medium text-slate-600 mb-4 leading-relaxed relative z-10">
                 What happens if you invest <strong>₹{activeSIP.toLocaleString("en-IN")}/mo</strong> for just 10 years, and then <strong>STOP</strong> completely, letting it sit for 20 more years?
               </p>
               <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative z-10">
                 <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-2"><span className="text-[10px] font-bold text-slate-500 uppercase">Invested (10 Yrs)</span><span className="text-sm font-black text-slate-800">₹{Math.round(stopSimInvested).toLocaleString("en-IN")}</span></div>
                 <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-[#da3832] uppercase tracking-widest">Wealth (Yr 30)</span><span className="text-xl font-black text-[#da3832]">{formatCurrencyShort(stopSimFVYear30)}</span></div>
               </div>
            </section>
          </div>
          
        </div> {/* END OF STACKED LAYOUT */}

        {/* EDUCATIONAL & RISK PANEL */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 pt-10 mt-10 border-t border-slate-200">
          <section aria-labelledby="education-heading">
            <h2 id="education-heading" className="text-lg font-black text-[#224c87] mb-6 uppercase tracking-wider">Educational Concepts</h2>
            <div className="space-y-4">
              <details className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm cursor-pointer focus-within:ring-2 focus-within:ring-[#224c87] outline-none">
                <summary className="font-black text-[#224c87] text-sm outline-none">What is the Cost of Delay?</summary>
                <p className="mt-4 text-xs text-slate-700 font-medium leading-relaxed">Compound interest works best when given time. Delaying your investment shortens the compounding period, requiring you to contribute significantly more out-of-pocket every month to reach the exact same financial goal.</p>
              </details>
              <details className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm cursor-pointer focus-within:ring-2 focus-within:ring-[#224c87] outline-none">
                <summary className="font-black text-[#224c87] text-sm outline-none">Pre-Tax vs Post-Tax Returns</summary>
                <p className="mt-4 text-xs text-slate-700 font-medium leading-relaxed">Pre-tax returns show your growth before taxes, while post-tax returns reflect the actual wealth you get to keep after long-term capital gains (LTCG) taxes are applied. Always plan using Post-Tax estimates for realism.</p>
              </details>
              <details className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm cursor-pointer focus-within:ring-2 focus-within:ring-[#224c87] outline-none">
                <summary className="font-black text-[#224c87] text-sm outline-none">How is the Required SIP Calculated?</summary>
                <div className="mt-4 text-xs text-slate-700 font-medium leading-relaxed">
                  <p>First, we calculate the <strong>Future Value</strong> of your goal by inflating its current cost. Next, we use the standard SIP formula to figure out exactly how much you need to invest every month.</p>
                  <code className="block bg-slate-50 p-3 rounded-xl text-[#da3832] text-[10px] mt-2 border border-slate-200">SIP = [ FV × r ] / [ (1 + r)^n - 1 ]</code>
                </div>
              </details>
            </div>
          </section>

          <section aria-labelledby="risk-heading">
            <div className="bg-white border-l-4 border-[#da3832] p-8 shadow-md rounded-r-3xl flex flex-col justify-center h-full border-y border-r border-slate-200">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded-full bg-[#da3832]/10 flex items-center justify-center text-[#da3832]">
                  <AlertCircle size={24} aria-hidden="true" />
                </div>
                <h2 id="risk-heading" className="text-lg font-black text-[#da3832] uppercase tracking-wider">Risk Awareness</h2>
              </div>
              <ul className="list-disc list-inside space-y-4 text-xs text-slate-700 font-medium leading-relaxed">
                <li><span className="font-bold text-black">Market Volatility:</span> Equity investments are subject to market risks. Expected returns are historically estimated.</li>
                <li><span className="font-bold text-black">Inflation Risk:</span> If actual inflation outpaces the projected rate, your accumulated corpus may fall short.</li>
                <li><span className="font-bold text-black">Tax Rules:</span> Current taxation rates are assumed but are subject to change as per government policies.</li>
              </ul>
            </div>
          </section>
        </div>

        {/* WEB VISIBLE DISCLAIMER */}
        <footer className="mt-12 pt-8 border-t border-slate-200 text-center pb-8" role="contentinfo">
          <p className="text-xs text-slate-500 max-w-4xl mx-auto leading-relaxed italic">
            <strong className="text-slate-600 font-bold not-italic">Disclaimer:</strong> This report is for educational and informational purposes only and does not constitute financial advice. The calculations rely on assumptions regarding future inflation rates, tax laws, and market returns. Actual market returns are volatile and cannot be guaranteed. Consult a certified financial planner or SEBI-registered advisor before making significant financial decisions.
          </p>
        </footer>

      </div>

      {/* PRINT / PDF SUMMARY VIEW (ONLY VISIBLE WHEN PRINTING) */}
      <div className="hidden print:block max-w-4xl mx-auto p-8 text-black bg-white" aria-hidden="true">
        
        {/* Print Header */}
        <div className="border-b-4 border-[#224c87] pb-6 mb-8">
          <h1 className="text-4xl font-black text-[#224c87] uppercase tracking-tight">Comprehensive Financial Plan</h1>
          <p className="text-sm font-bold text-gray-500 mt-2 uppercase tracking-widest">Generated on {today}</p>
        </div>

        {/* Executive Summary */}
        <div className="mb-10">
          <h2 className="text-xl font-black text-[#da3832] uppercase mb-4 tracking-wider">1. Executive Summary</h2>
          <div className="grid grid-cols-3 gap-6">
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-xs font-bold text-gray-500 uppercase">Target Wealth Needed</p>
              <p className="text-2xl font-black text-[#224c87]">₹{Math.round(totalFV).toLocaleString("en-IN")}</p>
            </div>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-xs font-bold text-gray-500 uppercase">Required Monthly SIP</p>
              <p className="text-2xl font-black text-[#da3832]">₹{activeSIP.toLocaleString("en-IN")}</p>
            </div>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-xs font-bold text-gray-500 uppercase">Current Readiness</p>
              <p className="text-2xl font-black text-[#224c87]">{readinessScore}% Ready</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-700 leading-relaxed">
            Based on your risk profile, we assume a portfolio return of <strong>{Math.round(adjustedReturn * 100)}% per year</strong>. 
            To reach your goals, you need to invest <strong>₹{activeSIP.toLocaleString("en-IN")} every month</strong>. 
            Over the lifetime of this plan, you will invest approximately <strong>₹{Math.round(totalInvestedPostTax).toLocaleString("en-IN")}</strong> out of pocket, 
            and the power of compounding will generate the remaining <strong>₹{Math.round(totalFV - totalInvestedPostTax).toLocaleString("en-IN")}</strong>.
          </p>
        </div>

        {/* Goal Breakdown Table */}
        <div className="mb-10">
          <h2 className="text-xl font-black text-[#da3832] uppercase mb-4 tracking-wider">2. Your Financial Goals</h2>
          <table className="w-full text-left border-collapse border border-gray-300">
            <thead>
              <tr className="bg-[#224c87] text-white">
                <th className="p-3 border border-gray-300 text-xs uppercase">Goal Name</th>
                <th className="p-3 border border-gray-300 text-xs uppercase">Timeline</th>
                <th className="p-3 border border-gray-300 text-xs uppercase">Today's Cost</th>
                <th className="p-3 border border-gray-300 text-xs uppercase">Future Value (Inflated)</th>
                <th className="p-3 border border-gray-300 text-xs uppercase">SIP Required</th>
              </tr>
            </thead>
            <tbody>
              {goalBreakdown.map((g, index) => (
                <tr key={index} className="bg-white">
                  <td className="p-3 border border-gray-300 font-bold">{g.name}</td>
                  <td className="p-3 border border-gray-300">{g.adjustedYears} Years</td>
                  <td className="p-3 border border-gray-300">₹{g.presentCost.toLocaleString("en-IN")}</td>
                  <td className="p-3 border border-gray-300">₹{Math.round(g.value).toLocaleString("en-IN")}</td>
                  <td className="p-3 border border-gray-300 text-[#da3832] font-bold">₹{showPostTax ? Math.round(g.postTaxSIP).toLocaleString("en-IN") : Math.round(g.preTaxSIP).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-gray-500 italic">* Future Value accounts for specific inflation rates for each category.</p>
        </div>

        {/* Insights & Probability */}
        <div className="mb-10 page-break-before">
          <h2 className="text-xl font-black text-[#da3832] uppercase mb-4 tracking-wider">3. Risk & Insights</h2>
          
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="p-6 border border-gray-300 rounded-lg">
              <h3 className="font-black text-gray-900 text-sm uppercase mb-3">Goal Success Probability</h3>
              <ul className="text-sm space-y-2">
                <li><strong>Low Return ({Math.round(lowReturnRate * 100)}%):</strong> {fvAtLow >= totalFV ? "Meet Goal" : "Miss Goal"}</li>
                <li><strong>Expected ({Math.round(adjustedReturn * 100)}%):</strong> Meet Goal</li>
                <li><strong>High Return ({Math.round(highReturnRate * 100)}%):</strong> Exceed Goal</li>
              </ul>
            </div>
            
            <div className="p-6 border border-gray-300 rounded-lg bg-[#f8fafc]">
              <h3 className="font-black text-[#224c87] text-sm uppercase mb-3">The "Stop Investing" Simulation</h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                If you invest ₹{activeSIP.toLocaleString("en-IN")}/mo for just 10 years (total invested: ₹{Math.round(stopSimInvested).toLocaleString("en-IN")}) and then stop completely, letting the money compound for 20 more years, your final wealth would be <strong>{formatCurrencyShort(stopSimFVYear30)}</strong>.
              </p>
            </div>
          </div>

          {/* Print Version Cost of Delay Warning  */}
          {delayYears > 0 && (
            <div className="p-6 border-2 border-[#da3832] rounded-lg bg-red-50">
              <h2 className="text-lg font-black text-[#da3832] uppercase mb-2">The Cost of Waiting</h2>
              <p className="text-sm text-gray-800 leading-relaxed">
                You selected to delay your investments by <strong>{delayYears} years</strong>. Because you lose out on early compounding, your required SIP jumps from <strong>₹{activeSIP.toLocaleString("en-IN")}</strong> to <strong>₹{Math.round(activeDelayedSIP).toLocaleString("en-IN")}</strong>. Waiting will cost you an extra <strong>₹{costOfDelay.toLocaleString("en-IN")} every month</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Footer / Disclaimers */}
        <div className="border-t-2 border-gray-200 pt-6 mt-10 text-xs text-gray-500 leading-relaxed text-justify">
          <strong>Important Disclaimer:</strong> This report is for educational and informational purposes only and does not constitute financial advice. The calculations rely on assumptions regarding future inflation rates, tax laws, and market returns. Actual market returns are volatile and cannot be guaranteed. Consult a certified financial planner or SEBI-registered advisor before making significant financial decisions.
        </div>
        
      </div>
    </main>
  );
}