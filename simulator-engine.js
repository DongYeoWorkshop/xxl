// simulator-engine.js
import { calculateDamage, calculateBaseStats, assembleFinalStats } from './calculations.js';
import { commonControls } from './simulator-common.js';
import { getStatusInfo, formatStatusMessage, formatStatusAction } from './simulator-status.js';
import { simParams } from './sim_params.js';
import { createSimulationContext, getSkillValue } from './sim_ctx.js';
import { initSupportState, processSupportTurn, getSupportBonuses } from './sim_support.js';

export function formatBuffState(charId, state, charDataObj, sData, stats) {
    const entries = [];
    const charParams = simParams[charId] || {};
    const getSkillInfo = (idx) => {
        const originalSkill = charDataObj.skills[idx];
        if (!originalSkill) return { label: "스킬", name: "알 수 없음", icon: "icon/main.png" };
        const isStampIcon = originalSkill.icon && originalSkill.icon.includes('sigilwebp/');
        let s = originalSkill;
        if (s.syncLevelWith) {
            const parentIdx = charDataObj.skills.findIndex(sk => sk.id === s.syncLevelWith);
            if (parentIdx !== -1) s = charDataObj.skills[parentIdx];
        }
        let label = isStampIcon ? "도장" : (idx === 1) ? "필살기" : (idx >= 2 && idx <= 6) ? `패시브${idx - 1}` : "스킬";
        return { label, name: originalSkill.name, icon: originalSkill.icon || "icon/main.png" };
    };
    for (const [key, val] of Object.entries(state)) {
        if (!val || val === 0 || (Array.isArray(val) && val.length === 0)) continue;
        if (key.startsWith('has_')) continue;
        let name = "", icon = 'icon/main.png', displayDur = "";
        const customName = sData?.stateDisplay?.[key];
        let foundCustomTag = null;
        const matchedParam = Object.values(charParams).find(p => p.stateKey === key || p.id === key || (p.id && `${p.id}_stacks` === key) || p.timerKey === key);
        if (matchedParam && matchedParam.customTag) foundCustomTag = matchedParam.customTag;

        // [수정] 스킬 매칭보다 statusRegistry를 먼저 확인하여 아이콘 우선순위 보장
        const statusInfo = getStatusInfo(key);
        const skillMatch = key.match(/^skill(\d+)/);

        if (statusInfo) {
            name = statusInfo.name; icon = statusInfo.icon;
            if (Array.isArray(val)) displayDur = `${Math.max(...val.map(v => v.dur || v))}턴 / ${val.length}중첩`;
            else displayDur = typeof val === 'number' ? `${val}${statusInfo.unit || '턴'}` : "ON";
        } else if (skillMatch) {
            const skillIdx = parseInt(skillMatch[1]) - 1, br = parseInt(stats.s1 || 0);
            if ((skillIdx === 4 && br < 30) || (skillIdx === 5 && br < 50) || (skillIdx === 6 && br < 75)) continue;
            
            // [수정] 턴 옆 상태창에서는 부모 카테고리([패시브2]) 대신 고유 이름만 사용
            const info = getSkillInfo(skillIdx);
            name = customName || `[${info.label}]`; // customName(체력응축 등)이 있으면 그것을 최우선 사용
            icon = info.icon;
            
            if (Array.isArray(val)) displayDur = `${Math.max(...val.map(v => v.dur || v))}턴 / ${val.length}중첩`;
            else displayDur = key.includes('stack') ? `${val}중첩` : `${val}턴`;
        } else if (customName) {
            name = customName;
            displayDur = typeof val === 'number' ? (key.includes('stack') ? `${val}중첩` : `${val}턴`) : "ON";
        } else continue;

        entries.push({ name, duration: displayDur, icon });
    }
    return entries;
}

export function runSimulationCore(context) {
    const { charId, charData, sData, stats, turns, iterations, targetCount, manualPattern, enemyAttrIdx, customValues, defaultGrowthRate, supportId } = context;
    const br = parseInt(stats.s1 || 0), baseStats = calculateBaseStats(charData.base, parseInt(stats.lv || 1), br, parseInt(stats.s2 || 0), defaultGrowthRate);
    const iterationResults = [];
    const flow = sData.flow || ['onTurn', 'onCalculateDamage', 'onAttack', 'onEnemyHit', 'onAfterAction'];

    for (let i = 0; i < iterations; i++) {
        let simState = sData.initialState ? JSON.parse(JSON.stringify(sData.initialState)) : {};
        // [추가] 서포터 상태 초기화
        let supportState = initSupportState(supportId);
        
        let total = 0, logs = [], perTurnDmg = [], stateLogs = [], detailedLogs = [], turnInfoLogs = [];
        const ultCD = (() => { const m = charData.skills[1].desc?.match(/\(쿨타임\s*:\s*(\d+)턴\)/); return m ? parseInt(m[1]) : 3; })();
        let cd = { ult: ultCD };

        for (let t = 1; t <= turns; t++) {
            logs.push(`<div class="sim-log-turn-header" data-turn="${t}">----- ${t}턴 -----</div>`);
            const turnDebugLogs = [];
            let currentTDmg = 0;
            const actionType = manualPattern[t-1] || (cd.ult === 0 ? 'ult' : 'normal');
            const isUlt = actionType === 'ult', isDefend = actionType === 'defend';
            const skill = isUlt ? charData.skills[1] : charData.skills[0];

            if (customValues.enemy_hp_auto) customValues.enemy_hp_percent = Math.max(0, Math.floor(100 * (1 - t / turns)));

            const isAllyUltTurn = sData.isAllyUltTurn ? sData.isAllyUltTurn(t) : (t > 1 && (t - 1) % 3 === 0);
            const dynCtx = createSimulationContext({ t, turns, charId, charData, stats, baseStats, simState, isUlt, targetCount, isDefend, isAllyUltTurn, customValues, logs, debugLogs: turnDebugLogs });

            // [추가] 서포터 턴 진행 (메인 캐릭터보다 먼저 행동)
            processSupportTurn(dynCtx, supportId, supportState);

            const getLatestSubStats = (isMulti = true) => {
                const subStats = { "기초공증": 0, "공증": 0, "고정공증": 0, "뎀증": 0, "평타뎀증": 0, "필살기뎀증": 0, "트리거뎀증": 0, "뎀증디버프": 0, "속성디버프": 0, "HP증가": 0, "기초HP증가": 0, "회복증가": 0, "배리어증가": 0, "지속회복증가": 0 };
                
                // [수정] 서포터 보너스 계산 전, 현재 공격의 광역 여부를 컨텍스트에 먼저 동기화
                dynCtx.isMulti = isMulti;

                // 그 후 서포터 보너스 합산 (메인 캐릭터 데이터 및 업데이트된 컨텍스트 전달)
                const sBonuses = getSupportBonuses(supportId, supportState, charData, dynCtx);
                for (const k in sBonuses) if (subStats.hasOwnProperty(k)) subStats[k] += sBonuses[k];

                charData.skills.forEach((s, idx) => {
                    if (!charData.defaultBuffSkills?.includes(s.id) || idx === 1) return;
                    if (s.hasCounter || s.hasToggle || s.customLink) return;
                    if (idx >= 4 && idx <= 6 && br < [0,0,0,0,30,50,75][idx]) return;
                    if (s.buffEffects) for (const k in s.buffEffects) if (subStats.hasOwnProperty(k)) subStats[k] += getSkillValue(charData, stats, idx, k);
                });
                if (sData.getLiveBonuses) {
                    const lb = sData.getLiveBonuses(dynCtx);
                    for (const k in lb) if (subStats.hasOwnProperty(k) && !isNaN(Number(lb[k]))) subStats[k] += Number(lb[k]);
                }
                const final = assembleFinalStats(baseStats, subStats);
                return { atk: final.최종공격력, subStats };
            };

            const calculateAndLogHit = (event) => {
                // [수정] 스킬 정보 찾기 및 광역 여부 엄밀 판정
                const targetId = event.skillId || event.originalId;
                const sIdx = targetId ? charData.skills.findIndex(sk => sk.id === targetId) : -1;
                const s = sIdx !== -1 ? charData.skills[sIdx] : null;
                
                // 1. 광역 여부 결정 (이벤트 명시값 -> 스킬 데이터값 -> 기본값 false 순)
                const isM = event.isMulti !== undefined ? event.isMulti : (s?.isMultiTarget || false);
                
                // 2. 결정된 광역 여부에 맞춰 스탯(서포터 가중치 포함) 계산
                const latest = getLatestSubStats(isM);
                
                const coef = event.val !== undefined ? event.val : (event.max || event.fixed || event.coef || 0);
                const dmgType = event.type || "추가공격";
                const dUnit = calculateDamage(dmgType, latest.atk, latest.subStats, coef, false, charData.info.속성, enemyAttrIdx);
                const finalD = isM ? dUnit * targetCount : dUnit;
                currentTDmg += finalD;

                if (finalD > 0) {
                    const label = event.customTag || (sIdx !== -1 ? ( (idx=sIdx) => (idx===0?'보통공격':idx===1?'필살기':idx<=6?`패시브${idx-1}`:'도장'))() : "추가타");
                    logs.push(`<div class="sim-log-line"><span>${t}턴: <span class="sim-log-tag">[${dmgType === '보통공격' ? '보통공격' : label}]</span> ${event.name || s?.name || "추가타"}:</span> <span class="sim-log-dmg">+${Math.floor(finalD).toLocaleString()}</span></div>`);
                }
                
                const sS = latest.subStats;
                const baseTags = { "뎀증": "Dmg", "뎀증디버프": "Vul", "속성디버프": "A-Vul" };
                let specKey = ""; let specLabel = "";
                if (dmgType === "보통공격") { specKey = "평타뎀증"; specLabel = "N-Dmg"; }
                else if (dmgType === "필살공격") { specKey = "필살기뎀증"; specLabel = "U-Dmg"; }
                else { specKey = "트리거뎀증"; specLabel = "T-Dmg"; }

                let dmgStr = Object.entries(baseTags)
                    .map(([key, label]) => sS[key] !== 0 ? ` / ${label}:${parseFloat(sS[key].toFixed(1))}%` : "")
                    .join("");
                if (specKey && sS[specKey] !== 0) dmgStr += ` / ${specLabel}:${parseFloat(sS[specKey].toFixed(1))}%`;

                const iconPath = event.icon || s?.icon || 'icon/main.png';
                const debugChanceText = event.chance ? ` (${event.chance}%)` : '';
                dynCtx.debugLogs.push({ 
                    type: 'action', 
                    msg: `ICON:${iconPath}|[${dmgType === '보통공격' ? '보통공격' : (event.customTag || "추가타")}] ${event.name || s?.name || "추가타"}: +${Math.floor(finalD).toLocaleString()}${debugChanceText}`, 
                    statMsg: `Coef:${parseFloat((isM ? coef * targetCount : coef).toFixed(1))}% / Atk:${latest.atk.toLocaleString()}${dmgStr}` 
                });
            };

            const processExtra = (e) => {
                if (!e) return;
                
                // [수정] 해금 체크 로직을 최상단으로 이동 (돌파 부족 시 즉시 차단)
                const targetSkillId = e.skillId || e.originalId;
                if (targetSkillId) {
                    const skillIdx = dynCtx.getSkillIdx(targetSkillId);
                    if (skillIdx !== -1 && !dynCtx.isUnlocked(skillIdx)) return;
                }

                // 조건 체크
                if (e.condition && !dynCtx.checkCondition(e.condition)) return;
                
                if (e.type === "buff" || e.type === "hit" || e.type === "action" || e.type === "stack") {
                    if (e.type === "buff") dynCtx.applyBuff(e);
                    else if (e.type === "hit") {
                        const idx = dynCtx.getSkillIdx(e.originalId);
                        const valKey = e.valKey !== undefined ? e.valKey : '추가공격';
                        const val = e.val !== undefined ? e.val : (e.valIdx !== undefined ? dynCtx.getVal(idx, e.valIdx) : dynCtx.getVal(idx, valKey));
                        const res = dynCtx.applyHit(e, val);
                        if (res) calculateAndLogHit({ ...res, isMulti: e.isMulti });
                    } else if (e.type === "action" && e.action === "all_consume") {
                        const key = e.stateKey || (e.id + "_stacks"); 
                        dynCtx.simState[key] = 0; 
                        // [수정] 객체 전체를 전달하여 태그와 아이콘 정보 누락 방지
                        dynCtx.log(e, "all_consume");
                    } else if (e.type === "stack") {
                        dynCtx.gainStack(e);
                    }
                    return;
                }
                
                if (e.skillId) {
                    const skillIdx = dynCtx.getSkillIdx(e.skillId);
                    if (skillIdx !== -1 && !dynCtx.isUnlocked(skillIdx)) return;
                }

                const slots = [e.step1, e.step2, e.step3]; if (!e.step1 && !e.step2 && !e.step3 && (e.coef !== undefined || e.val !== undefined)) slots[1] = e;
                slots.forEach(slot => {
                    if (!slot) return;
                    let res = (typeof slot === 'function') ? slot(dynCtx) : slot;
                    if (!res) return;
                    (Array.isArray(res) ? res : [res]).forEach(r => {
                        if (typeof r === 'string') dynCtx.debugLogs.push(r);
                        else calculateAndLogHit({ ...e, ...(typeof r === 'object' ? r : { val: r }) });
                    });
                });
            };

            const autoExecuteParams = (phase) => {
                const p = simParams[charId]; if (!p) return;
                Object.values(p).filter(param => param.phase === phase || (param.triggers && param.triggers.includes(phase)))
                    .sort((a, b) => (a.order !== undefined ? a.order : 999) - (b.order !== undefined ? b.order : 999)).forEach(processExtra);
            };

            const handleHook = (hook) => {
                const res = sData[hook]?.(dynCtx);
                if (res?.extraHits) res.extraHits.flat(Infinity).filter(Boolean).sort((a, b) => (a.order || 999) - (b.order || 999)).forEach(processExtra);
            };

            flow.forEach(step => {
                if (step === 'onTurn') {
                    if (context.customValues.enemy_hp_auto) turnInfoLogs.push({ enemyHp: context.customValues.enemy_hp_percent });
                    else turnInfoLogs.push({});
                    for (const key in simState) if (key.endsWith('_timer')) {
                        if (typeof simState[key] === 'number' && simState[key] > 0) simState[key]--;
                        else if (Array.isArray(simState[key])) simState[key] = simState[key].map(v => (typeof v === 'number' ? v - 1 : { ...v, dur: v.dur - 1 })).filter(v => (v.dur || v) > 0);
                    }
                    handleHook('onTurn');
                    autoExecuteParams(step);
                    turnDebugLogs.forEach(item => detailedLogs.push({ t, ...(typeof item === 'string' ? { type: 'debug', msg: item } : item) }));
                    turnDebugLogs.length = 0;
                    stateLogs.push(formatBuffState(charId, simState, charData, sData, stats));
                } else if (step === 'onCalculateDamage') {
                    handleHook('onCalculateDamage');
                    autoExecuteParams(step);
                    turnDebugLogs.forEach(item => detailedLogs.push({ t, ...(typeof item === 'string' ? { type: 'debug', msg: item } : item) }));
                    turnDebugLogs.length = 0;
                } else if (step === 'onAttack') {
                    if (isDefend) {
                        logs.push(`<div class="sim-log-line"><span>${t}턴: <span class="sim-log-tag">[방어]</span></span> <span class="sim-log-dmg">+0</span></div>`);
                        dynCtx.debugLogs.push('ICON:icon/simul.png|[방어]');
                        handleHook('onAttack');
                    } else {
                        let turnDmgTotal = 0;
                        const targetType = isUlt ? "필살공격" : "보통공격";
                        
                        skill.damageDeal?.forEach((e, idx) => {
                            if (e.type !== targetType && e.type !== "기초공격") return;

                            // [수정] 광역 여부 판정 우선순위: 개별항목 설정 > 스킬 전체 설정
                            let isM = false;
                            if (e.isSingleTarget) isM = false;
                            else if (e.isMultiTarget || (isUlt && stats.stamp && e.stampIsMultiTarget)) isM = true;
                            else isM = skill.isMultiTarget || false;

                            const tc = isM ? targetCount : 1;

                            // 결정된 광역 여부에 맞춰 스탯 계산 (서포터 가중치 반영)
                            const st = getLatestSubStats(isM); 

                            const param = e.val ? e.val : idx;
                            const fC = dynCtx.getVal(charData.skills.indexOf(skill), param);
                            
                            const hitDmg = calculateDamage(targetType, st.atk, st.subStats, fC, isUlt && stats.stamp, charData.info.속성, enemyAttrIdx) * tc;
                            const hitCoef = ((isUlt && stats.stamp && e.val.stampMax) ? e.val.stampMax : e.val.max) * tc;

                            if (hitDmg > 0) {
                                const mainTag = `<span class="sim-log-tag">[${isUlt?'필살기':'보통공격'}]</span>`;
                                
                                // 요약 로그
                                logs.push(`<div class="sim-log-line"><span>${mainTag} ${skill.name}:</span> <span class="sim-log-dmg">+${Math.floor(hitDmg).toLocaleString()}</span></div>`);
                                
                                // 상세 로그 (수치 정보 포함)
                                const baseTags = { "뎀증": "Dmg", "뎀증디버프": "Vul", "속성디버프": "A-Vul" };
                                const specKey = isUlt ? "필살기뎀증" : "평타뎀증";
                                const specLabel = isUlt ? "U-Dmg" : "N-Dmg";
                                let dmgStr = Object.entries(baseTags)
                                    .map(([key, label]) => st.subStats[key] !== 0 ? ` / ${label}:${parseFloat(st.subStats[key].toFixed(1))}%` : "")
                                    .join("");
                                if (st.subStats[specKey] !== 0) dmgStr += ` / ${specLabel}:${parseFloat(st.subStats[specKey].toFixed(1))}%`;

                                dynCtx.debugLogs.push({ 
                                    type: 'action', 
                                    msg: `ICON:${skill.icon}|${mainTag} ${skill.name}: +${Math.floor(hitDmg).toLocaleString()}`, 
                                    statMsg: `Coef:${parseFloat((isM ? hitCoef : hitCoef / tc).toFixed(1))}% / Atk:${st.atk.toLocaleString()}${dmgStr}` 
                                });

                                turnDmgTotal += hitDmg;
                            }
                        });

                        currentTDmg = turnDmgTotal;
                        handleHook('onAttack');
                    }
                    autoExecuteParams(step);
                    turnDebugLogs.forEach(item => detailedLogs.push({ t, ...(typeof item === 'string' ? { type: 'debug', msg: item } : item) }));
                    turnDebugLogs.length = 0;
                } else if (step === 'onEnemyHit') {
                    const tr = sData.isTaunted?.(dynCtx);
                    const tl = (typeof tr === 'object' ? tr.label : tr) || "조롱 상태", tp = tr?.prob || 100;
                    let isHit = false; let msg = "";
                    if (tr) { if (tp >= 100 || Math.random() * 100 < tp) { isHit = true; msg = formatStatusMessage(tl, tp); } }
                    else if (context.customValues.normal_hit_prob > 0 && !dynCtx.isAllyUltTurn && Math.random() * 100 < context.customValues.normal_hit_prob) { isHit = true; msg = `보통공격 피격 (${context.customValues.normal_hit_prob}%)`; }
                    else if (context.customValues.hit_prob > 0 && Math.random() * 100 < context.customValues.hit_prob) { isHit = true; msg = `피격 (${context.customValues.hit_prob}%)`; }
                    if (isHit) {
                        dynCtx.isHit = true;
                        for (let h = 0; h < (tr ? targetCount : 1); h++) {
                            dynCtx.debugLogs.push(`ICON:icon/simul.png|${msg}`);
                            // [수정] being_hit 트리거에 연결된 모든 파라미터(스택, 버프, 반격 등)를 일괄 실행
                            autoExecuteParams("being_hit");
                        }
                    }
                    // [예외처리] 본인 피격 여부와 상관없이 매턴 적 공격 페이즈 훅 실행 (파미도 아군 피격 등)
                    handleHook('onEnemyHit');
                    
                    turnDebugLogs.forEach(item => detailedLogs.push({ t, ...(typeof item === 'string' ? { type: 'debug', msg: item } : item) }));
                    turnDebugLogs.length = 0;
                } else if (step === 'onAfterAction') {
                    handleHook('onAfterAction');
                    autoExecuteParams(step);
                    turnDebugLogs.forEach(item => detailedLogs.push({ t, ...(typeof item === 'string' ? { type: 'debug', msg: item } : item) }));
                    turnDebugLogs.length = 0;
                }
            });
            total += currentTDmg; perTurnDmg.push({ dmg: currentTDmg, cumulative: total });
            if (isUlt) cd.ult = ultCD - 1; else if (cd.ult > 0) cd.ult--;
        }
        iterationResults.push({ total, logs, perTurnDmg, stateLogs, detailedLogs, turnInfoLogs });
    }
    const totals = iterationResults.map(d => d.total), avg = Math.floor(totals.reduce((a, b) => a + b, 0) / iterations);
    const min = Math.min(...totals), max = Math.max(...totals);
    
    // [수정] 요약 카드용으로만 P05, P95 추출 (그래프는 절대값 min/max 사용)
    const sortedIterationResults = [...iterationResults].sort((a, b) => a.total - b.total);
    const minRes = sortedIterationResults[Math.floor(iterations * 0.05)] || sortedIterationResults[0];
    const maxRes = sortedIterationResults[Math.floor(iterations * 0.95)] || sortedIterationResults[iterationResults.length - 1];
    const avgRes = iterationResults.sort((a, b) => Math.abs(a.total - avg) - Math.abs(b.total - avg))[0];

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 600;
    const range = max - min;
    // [수정] 구간(Bin) 개수: 최대 100개로 설정
    const binCount = isMobile ? 30 : Math.min(iterations, 100);
    const bins = new Array(binCount).fill(0);
    const centerIdx = Math.floor(binCount / 2);
    iterationResults.forEach(r => { let b = (range === 0) ? centerIdx : Math.floor(((r.total - min) / range) * (binCount - 1)); bins[b]++; });
    
    const xLabels = []; 
    if (range > 0) for (let j = 0; j <= 5; j++) { const v = min + (range * (j / 5)); xLabels.push({ pos: (j / 5) * 100, label: v >= 1000 ? (v / 1000).toFixed(0) + 'K' : Math.floor(v) }); } 
    else xLabels.push({ pos: 50, label: min >= 1000 ? (min / 1000).toFixed(0) + 'K' : Math.floor(min) });

    return { 
        min: min.toLocaleString(), // 그래프 축을 위해 절대 최소값 복구
        max: max.toLocaleString(), // 그래프 축을 위해 절대 최대값 복구
        avg: avgRes.total.toLocaleString(), // [수정] 산술 평균 대신 로그 회차의 실제 데미지 표시
        p05: minRes.total.toLocaleString(), // 카드 표시용 현실적 최소
        p95: maxRes.total.toLocaleString(), // 카드 표시용 현실적 최대
        results: {
            min: minRes,
            avg: avgRes,
            max: maxRes
        },
        // [수정] graphData에 inRange(예측구간 포함 여부) 속성 추가
        graphData: bins.map((c, i) => {
            // 현재 빈(Bar)이 커버하는 데미지 범위 계산
            const binStart = min + (range * (i / binCount));
            const binEnd = min + (range * ((i + 1) / binCount));
            const binMid = (binStart + binEnd) / 2;
            
            // 예측 구간(P05 ~ P95) 안에 이 막대의 중심값이 들어가는지 판별
            const inRange = (binMid >= minRes.total && binMid <= maxRes.total);
            const isAvg = (range === 0) ? (i === centerIdx) : (i === Math.floor(((avgRes.total - min) / range) * (binCount - 1)));
            
            return { 
                h: (c / Math.max(...bins)) * 100, 
                isAvg: isAvg,
                inRange: inRange 
            };
        }), 
        axisData: { x: xLabels, y: Array.from({length: 6}, (_, i) => Math.floor(Math.max(...bins) * (5 - i) / 5)) }, 
        yMax: Math.max(...bins) 
    };
}
