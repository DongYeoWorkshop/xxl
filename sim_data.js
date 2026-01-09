// sim_data.js
import { getSkillMultiplier } from './formatter.js';
import { simParams } from './sim_params.js';

export const simCharData = {
    "shinrirang": {
      commonControls: ["normal_hit_prob"],
      initialState: {
          skill7_stacks: 0,
          skill4_timer: 0,
          skill8_timer: 0,
          skill5_timer: []
      },
      onTurn: (ctx) => {},
      onCalculateDamage: (ctx) => {
          return { extraHits: [] };
      },
      onAttack: (ctx) => {
          // [자동화] 모든 스킬(4, 8번)은 sim_params 설정을 통해 엔진이 자동으로 처리합니다.
          return { extraHits: [] };
      },
      onEnemyHit: (ctx) => {
          // [자동화] 스킬 5번(반격)은 sim_params 설정을 통해 엔진이 자동으로 처리합니다.
          return { extraHits: [] };
      },
      getLiveBonuses: (ctx) => {
        const p = simParams.shinrirang;
        const bonuses = { "뎀증": 0, "공증": 0, "트리거뎀증": 0 };
        bonuses["공증"] += (ctx.simState.skill7_stacks || 0) * ctx.getVal(6, '공증');
        bonuses["뎀증"] += (ctx.simState.skill5_timer || []).length * ctx.getVal(4, '뎀증');

        if (ctx.simState.skill4_timer > 0) bonuses["트리거뎀증"] += ctx.getVal(3, '트리거뎀증');
        if (ctx.simState.skill8_timer > 0) bonuses["트리거뎀증"] += ctx.getVal(7, '트리거뎀증', true);

        return bonuses;
    }
  },
  "tayangsuyi": {
    stateDisplay: {
        "skill4_spirit_stacks": "[전의]"
    },
    commonControls: ["ally_warrior_debuffer_count", "ally_ult_count"],
    initialState: {
        skill4_spirit_stacks: 0,
        skill5_timer: 0,
        skill7_timer: []
    },

    onTurn: (ctx) => {
        const p = simParams.tayangsuyi;
        // [패시브2] 아군 캐릭터 수만큼 전의 획득 이벤트 발생
        if (!ctx.isAllyUltTurn) {
            const allyCount = ctx.customValues.ally_warrior_debuffer_count || 0;
            
            // 엔진이 sim_params 설정을 보고 확률 체크를 하므로, 여기서는 횟수만큼 트리거만 실행
            for (let i = 0; i < allyCount; i++) {
                ctx.checkStackTriggers("ally_attack");
            }
        } 
        // [패시브5] 아군 필살기 횟수만큼 궐기 버프 이벤트 발생
        else {
            const allyUltCount = ctx.customValues.ally_ult_count || 0;
            for (let i = 0; i < allyUltCount; i++) {
                ctx.checkBuffTriggers("ally_ult");
            }
        }
    },
    onCalculateDamage: (ctx) => {
        return { extraHits: [] };
    },
    onAttack: (ctx) => {
        return { extraHits: [] };
    },
    onEnemyHit: (ctx) => {
        return { extraHits: [] };
    },
    onAfterAction: (ctx) => {
        // [자동화] 워밍업 함성 및 전의 소모는 sim_params 설정을 통해 엔진이 자동으로 처리합니다.
        return { extraHits: [] };
    },
    getLiveBonuses: (ctx) => {
        const p = simParams.tayangsuyi;
        const bonuses = { "뎀증": 0, "공증": 0, "평타뎀증": 0, "필살기뎀증": 0 };
        
        // [패시브2] 전의 중첩당 필살기 뎀증
        const spiritStacks = Number(ctx.simState.skill4_spirit_stacks) || 0;
        const bonusPerStack = (p && p.skill4_spirit && p.skill4_spirit.bonusPerStack) ? p.skill4_spirit.bonusPerStack : 6;
        bonuses["필살기뎀증"] += spiritStacks * bonusPerStack;

        // [패시브5] 궐기 중첩당 필살기 뎀증 (1턴 지속 중첩 버프)
        const gweolgiTimer = ctx.simState.skill7_timer;
        const gweolgiStacks = Array.isArray(gweolgiTimer) ? gweolgiTimer.length : (gweolgiTimer > 0 ? 1 : 0);
        bonuses["필살기뎀증"] += gweolgiStacks * ctx.getVal(6, '필살기뎀증');

        // [패시브3] 워밍업 함성 (평타 뎀증)
        if (!ctx.isUlt && ctx.simState.skill5_timer > 0) {
            bonuses["평타뎀증"] += ctx.getVal(4, '평타뎀증');
        }

        // [도장] 9중첩 보너스 (데이터 기반 조건 체크)
        if (ctx.checkCondition(p.skill8_stamp.condition)) {
            bonuses["뎀증"] += p.skill8_stamp.bonus; 
        }

        return bonuses;
    }
  },
  "choiyuhyun": {
    commonControls: ["hp_100_prob"],
    onTurn: (ctx) => {}, // 엔진이 p.skill4_buff (onTurn) 자동 처리
    onCalculateDamage: (ctx) => {
        return { extraHits: [] }; // 엔진이 p.test_debuff (setup) 자동 처리
    },
    onAttack: (ctx) => {
        return { extraHits: [] }; // 엔진이 p.skill5_hit, p.skill5_buff, p.skill7_hit 등을 자동 처리
    },
    onEnemyHit: (ctx) => {
        return { extraHits: [] };
    },
    onAfterAction: (ctx) => {
        return { extraHits: [] };
    },
    getLiveBonuses: (ctx) => {
        const bonuses = { "뎀증": 0 };
        
        // 1. [패시브2] HP 100% 시 데미지 증가
        if (ctx.simState.skill4_timer > 0) {
            bonuses["뎀증"] += ctx.getVal(3, '뎀증');
        }

        // 2. [도장] 적 5명 이상 시 데미지 증가
        if (ctx.stats.stamp && ctx.targetCount >= 5) {
            bonuses["뎀증"] += ctx.getVal(7, '뎀증', true);
        }

        return bonuses;
    }
  },
  "baade": {
    commonControls: [],
    initialState: {
        scar_stacks: 0, // params 연동을 위해 스택(숫자)으로 관리
        skill7_timer: 0
    },
    // 1. 공격
    onAttack: (ctx) => {
        const extraHits = [];
        const hasScar = ctx.simState.scar_stacks > 0;

        if (!ctx.isUlt) {
            // [보통공격] 각흔 대상 평타 시 트리거 발동
            if (hasScar) {
                ctx.checkBuffTriggers("attack_on_scar");
            }
        }
        // 필살기 시 각흔 상태 변경은 추가타 판정을 위해 onAfterAction으로 지연시킴
        return { extraHits };
    },
    
    // 2. 행동 종료 후 (상태 갱신)
    onAfterAction: (ctx) => {
        if (ctx.isUlt) {
            const hasScar = ctx.simState.scar_stacks > 0;
            if (hasScar) {
                // 각흔 소모 (패시브4 조건: 필살기로 타격 시 해제)
                ctx.simState.scar_stacks = 0;
                ctx.log({ name: "쇄강파 공격 [각흔]", icon: "icon/attack(strong).webp" }, "consume", null, null, false, "필살기");
            } else {
                // 각흔 부여
                ctx.simState.scar_stacks = 1;
                ctx.log({ name: "쇄강파 공격 [각흔]", icon: "icon/attack(strong).webp" }, "apply", null, null, false, "필살기");
            }
        }
        return { extraHits: [] };
    },

    // 3. 실시간 보너스
    getLiveBonuses: (ctx) => {
        const bonuses = { "평타뎀증": 0, "필살기뎀증": 0 };
        const hasScar = ctx.simState.scar_stacks > 0;

        if (hasScar) {
            // [패시브2] 그리움의 사랑 자장가: 각흔 대상 필살기 뎀증
            bonuses["필살기뎀증"] += ctx.getVal(3, '필살기뎀증');
            // [패시브4] 광맥 직감: 각흔 대상 평타 뎀증
            bonuses["평타뎀증"] += ctx.getVal(4, '평타뎀증');
        }

        // [패시브5] 집중 분쇄: 버프 상태일 때 필살기 뎀증
        if (ctx.simState.skill7_timer > 0) {
            bonuses["필살기뎀증"] += ctx.getVal(6, '필살기뎀증');
        }

        return bonuses;
    }
  },
  "khafka": {
    commonControls: ["is_paralysis_immune"],
    onTurn: (ctx) => {}, 
    onAttack: (ctx) => {
        return { extraHits: [] }; 
    },
    onAfterAction: (ctx) => {
        return { extraHits: [] }; 
    },
    getLiveBonuses: (ctx) => {
        const bonuses = { "뎀증디버프": 0, "필살기뎀증": 0 };

        // [패시브2] 긴박 공감
        if (ctx.simState.skill4_timer > 0) {
            bonuses["뎀증디버프"] += ctx.getVal(3, '뎀증디버프');
        }
        // [패시브3] 밧줄 낙인
        if (ctx.simState.skill5_timer > 0) {
            bonuses["뎀증디버프"] += ctx.getVal(4, '뎀증디버프');
        }
        // [패시브5] 급습 밧줄
        if (ctx.simState.skill7_timer > 0) {
            bonuses["뎀증디버프"] += ctx.getVal(6, '뎀증디버프');
        }

        // [도장/특수] 긴박 공감[마비]: 마비 면역 대상 필살기 뎀증
        if (ctx.isUlt && ctx.customValues.is_paralysis_immune) {
            bonuses["필살기뎀증"] += ctx.getVal(7, '필살기뎀증', true);
        }

        return bonuses;
    }
  },
  "anuberus": {
    commonControls: [],
    initialState: {
        skill4_black_timer: 0,
        skill4_white_timer: 0,
        skill4_timer: [], // 속성디버프
        skill5_timer: []  // 사냥개 스택
    },
    // 1. 공격
    onAttack: (ctx) => {
        const extraHits = [];
        if (ctx.isDefend) return { extraHits };
        const p = simParams.anuberus;

        // [순서 1] 필살기 시 '기존' 사냥개 스택 비례 추가타 (패시브3)
        const currentStacks = ctx.simState.skill5_timer.length;
        if (ctx.isUlt && currentStacks > 0) {
            extraHits.push({
                skillId: "anuberus_skill5",
                name: "유령의 심장 심판",
                coef: currentStacks * ctx.getVal(4, '추가공격'),
                order: 1 // 가장 먼저 실행
            });
        }

        // [순서 2] 개의 협공 (공격 시점에 개가 이미 깨어있는지 체크)
        const isBlackAwake = ctx.simState.skill4_black_timer > 0;
        const isWhiteAwake = ctx.simState.skill4_white_timer > 0;

        // 깨어있는 개마다 파라미터 설정을 extraHits에 담아 반환
        if (isBlackAwake) {
            extraHits.push(p.skill4_vuln, p.skill5_stack);
            if (ctx.stats.stamp) extraHits.push(p.skill8_hit);
        }
        if (isWhiteAwake) {
            extraHits.push(p.skill4_vuln, p.skill5_stack);
            if (ctx.stats.stamp) extraHits.push(p.skill8_hit);
        }

        return { extraHits };
    },
    
    // 2. 실시간 보너스
    getLiveBonuses: (ctx) => {
        const bonuses = { "속성디버프": 0, "필살기뎀증": 0 };

        // [패시브2] 속성디버프 합산
        if (ctx.simState.skill4_timer.length > 0) {
            bonuses["속성디버프"] += ctx.simState.skill4_timer.length * ctx.getVal(3, '속성디버프');
        }

        // [패시브6] 무음모드 해제: 깨어있는 개 수에 비례한 필살기 뎀증
        const activeDogs = (ctx.simState.skill4_black_timer > 0 ? 1 : 0) + (ctx.simState.skill4_white_timer > 0 ? 1 : 0);
        if (activeDogs > 0) {
            bonuses["필살기뎀증"] += activeDogs * ctx.getVal(6, '필살기뎀증');
        }

        return bonuses;
    }
  },
  "goldenryder": {
    commonControls: ["hit_prob"],
    initialState: {
        // [수정] 2턴까지 유지되도록 초기값을 3으로 설정
        blazing_stride_timer: [3, 3, 3, 3, 3, 3], 
        skill2_timer: 0,
        skill5_timer: 0,
        skill7_timer: 0
    },
    
    onAttack: (ctx) => {
        // 모든 추가타 로직은 sim_params.js에서 자동 처리됨
        return { extraHits: [] };
    },

    getLiveBonuses: (ctx) => {
        const bonuses = { "뎀증": 0, "평타뎀증": 0 };
        
        // 1. 열화질보 중첩당 평타 뎀증 (중첩당 10%)
        const strideCount = ctx.simState.blazing_stride_timer.length;
        bonuses["평타뎀증"] += strideCount * ctx.getVal(3, '평타뎀증');

        // 2. 필살기 버프 자체 평타 뎀증 (50%)
        if (!ctx.isUlt && ctx.simState.skill2_timer > 0) {
            bonuses["평타뎀증"] += ctx.getVal(1, '평타뎀증', true);
        }

        // 3. 피격 뎀증 (20%)
        if (ctx.simState.skill5_timer > 0) {
            bonuses["뎀증"] += ctx.getVal(4, '뎀증');
        }

        return bonuses;
    }
  },
  "tyrantino": {
    commonControls: ["hit_prob"],
    stateDisplay: {
        "fury_stacks": "용의 분노",
        "fear_timer": "용족의 위압"
    },
    initialState: {
        fury_stacks: 0,      // 이름 복구
        fear_timer: [],      // 이름 복구
        dmg_reduce_timer: 0  // 이름 복구
    },
    
    // 1. 공격 준비 (데미지 계산 전)
    onCalculateDamage: (ctx) => {
        return { extraHits: [] };
    },

    // 2. 공격
    onAttack: (ctx) => {
        // [도장] 필살기 시 위압 수급 로직은 순서 보장을 위해 sim_params로 이관
        return { extraHits: [] };
    },

    onAfterAction: (ctx) => {
        return { extraHits: [] };
    },

    getLiveBonuses: (ctx) => {
        const bonuses = { "뎀증": 0 };
        const p = simParams.tyrantino;
        
        // [패시브7] 승리의 Lowball: 적에게 뎀감 효과 있을 시 뎀증
        if (ctx.isUlt || ctx.simState.dmg_reduce_timer > 0) {
            bonuses["뎀증"] += ctx.getVal(6, '뎀증');
        }

        return bonuses;
    }
  },
  "tamrang": {
    commonControls: [],
    customControls: [
        { id: "self_sleep_active", type: "toggle", label: "수면버프 자가적용", initial: false, description: "체크 시 아군이 소비하지 않은 디버프를 본인이 다음 턴에 직접 사용합니다." },
        { id: "is_sleep_immune", type: "toggle", label: "수면 면역", initial: false, description: "적에게 수면 면역이 있어 수면 및 도장 디버프가 적용되지 않습니다." }
    ],
    initialState: {
        sleep_timer: 0,
        skill4_timer: [], // 패시브2
        skill7_timer: 0,  // 패시브5 (전체)
        skill8_timer: 0,  // 도장 (전체)
        consume_next: false
    },
    
    onAttack: (ctx) => {
        const extraHits = [];
        // [특수] 자가적용 시 수면 소모 예약
        if (!ctx.isUlt && ctx.simState.sleep_timer > 0 && ctx.customValues.self_sleep_active) {
            ctx.simState.consume_next = true;
        }

        // [신규] 수면 및 도장 디버프 수동 적용 (면역 체크)
        if (ctx.isUlt && !ctx.customValues.is_sleep_immune) {
            const p = simParams.tamrang;
            // 수면
            ctx.applyBuff(p.sleep_status);
            // 도장
            if (ctx.stats.stamp) {
                ctx.applyBuff(p.skill8_vuln);
            }
        }

        return { extraHits };
    },

    onAfterAction: (ctx) => {
        // [특수] 자가적용 로직 유지
        if (ctx.isUlt) {
            if (!ctx.customValues.self_sleep_active) {
                // 자가적용 안하면 즉시 아군이 쓴걸로 침
                ctx.simState.sleep_timer = 0;
                ctx.simState.skill8_timer = 0;
                ctx.log("-아군의 디버프 소비-");
            }
        }
        if (ctx.simState.consume_next) {
            ctx.simState.sleep_timer = 0;
            ctx.simState.skill8_timer = 0;
            ctx.simState.consume_next = false;
            ctx.log("수면/도장디버프", "consume");
        }
        return { extraHits: [] };
    },

    getLiveBonuses: (ctx) => {
        const bonuses = { "뎀증": 0, "뎀증디버프": 0 };
        const p = simParams.tamrang;

        // 1. 패시브2 (단일 받뎀증) -> 가중치 적용
        if (ctx.simState.skill4_timer.length > 0) {
            bonuses["뎀증디버프"] += ctx.getWeightedVal(p.skill4_vuln, '뎀증디버프');
        }

        // 2. 패시브5 & 도장 (전체 받뎀증) -> getVal로 100% 적용
        if (ctx.simState.skill7_timer > 0) {
            bonuses["뎀증디버프"] += ctx.getVal(6, '뎀증디버프');
        }
        if (ctx.simState.skill8_timer > 0) {
            bonuses["뎀증디버프"] += 75; // 도장 75% 고정값
        }

        // 3. 패시브4 (수면 대상 뎀증) -> 가중치 적용
        if (ctx.simState.sleep_timer > 0) {
            const baseVal = ctx.getVal(4, '뎀증');
            bonuses["뎀증"] += baseVal * (1 / ctx.targetCount);
        }

        return bonuses;
    }
  },
  "wang": {
    commonControls: ["hit_prob"],
    customControls: [
        { id: "self_extra_dmg_active", type: "toggle", label: "추가데미지 본인적용", initial: false, description: "체크 시 본인이 보통공격할 때 필살기(패란의 영감) 추가타를 파티원 기여분 포함하여 계산에 포함합니다." }
    ],
    initialState: {
        skill2_timer: 0,
        skill5_timer: [] // 피격 시 뎀증 (최대 2중첩)
    },
    onAttack: (ctx) => {
        return { extraHits: [] };
    },
    onAfterAction: (ctx) => {
        const extraHits = [];
        // [수정] onAfterAction으로 이동: 필살기 턴에는 버프 부여 후 실행
        // 조건: 
        // 1. 자가적용 체크됨
        // 2. 버프가 있음 (방금 필살기로 켰거나 유지 중)
        // 3. 아군 필살기 턴이 아님 (아군이 평타를 쳐야 함)
        
        // 주의: 필살기 턴(isUlt)이면 onAttack 단계에서 skill2_timer가 갱신되지 않았을 수 있으므로
        // onAfterAction 시점에서는 이미 갱신된 상태임.
        // 다만 본인이 필살기를 쓴 턴이면 onAttack의 엔진 자동 추가타(본인분)는 없으므로 여기서 아군 4인분만 챙기면 됨.
        // 본인이 평타를 쓴 턴이면 엔진이 본인 1타는 처리했으므로 여기서 아군 4인분만 챙기면 됨.
        // 결론: 항상 아군 4인분만 loop 돌리면 됨.

        if (ctx.customValues.self_extra_dmg_active && ctx.simState.skill2_timer > 0 && !ctx.isAllyUltTurn) {
            const isWangStamped = !!(ctx.stats.stamp);
            const hitCoef = ctx.getVal(1, '추가공격', isWangStamped);
            
            for (let i = 0; i < 4; i++) {
                extraHits.push({ 
                    name: `멍: 패란의 영감 (아군 #${i+1})`, 
                    skillId: "wang_skill2", 
                    val: hitCoef, 
                    type: "추가공격", 
                    customTag: "필살기", 
                    icon: "icon/attack(strong).webp" 
                });
                
                if (isWangStamped && Math.random() < 0.5) {
                    extraHits.push({ 
                        name: `멍: [도장] 패란의 영감 (아군 #${i+1})`, 
                        skillId: "wang_skill2", 
                        val: hitCoef, 
                        type: "추가공격", 
                        customTag: "도장", 
                        icon: "images/sigilwebp/sigil_wang.webp" 
                    });
                }
            }
        }
        return { extraHits };
    },
    getLiveBonuses: (ctx) => {
        const bonuses = { "뎀증": 0 };
        // [패시브3] 피격 시 뎀증 합산
        if (ctx.simState.skill5_timer.length > 0) {
            bonuses["뎀증"] += ctx.simState.skill5_timer.length * ctx.getVal(4, '뎀증');
        }
        return bonuses;
    }
  },
  "locke": {
    commonControls: ["hit_prob"],
    stateDisplay: {
        "blood_mark_timer": "호혈표지"
    },
    customControls: [
        { id: "enemy_hp_percent", type: "input", label: "적 HP(%)", min: 1, max: 100, initial: 100, hasAuto: true, autoId: "enemy_hp_auto" }
    ],
    initialState: {
        blood_mark_timer: [],      // 호혈표지 (배열)
        skill5_timer: [],     
        skill8_buff_timer: 0   // 필살기 버프 (숫자)
    },
    
    onAttack: (ctx) => {
        const extraHits = [];
        const p = simParams.locke;
        const enemyHp = ctx.customValues.enemy_hp_percent;

        if (ctx.isUlt) {
            // [필살기]
            // 1. 도장 조건 체크: 호혈표지 2중첩 이상 시 필살기 버프
            if (ctx.stats.stamp && ctx.simState.blood_mark_timer.length >= 2) {
                ctx.setTimer("skill8_buff_timer", 1);
            }

            // 2. 패시브5 (피의 공명) 추가타: 호혈표지 2중첩 이상 OR 적 HP 25% 미만
            if (ctx.simState.blood_mark_timer.length >= 2 || enemyHp < 25) {
                extraHits.push(p.skill7_hit);
            }
        }

        return { extraHits };
    },

    getLiveBonuses: (ctx) => {
        const bonuses = { "뎀증": 0, "필살기뎀증": 0 };
        const p = simParams.locke;
        const enemyHp = ctx.customValues.enemy_hp_percent;

        // [패시브2] 상어 사냥 추격: 적 HP 구간별 뎀증
        let huntStacks = 0;
        if (enemyHp < 75) huntStacks++;
        if (enemyHp < 50) huntStacks++;
        if (enemyHp < 25) huntStacks++;
        
        if (huntStacks > 0) {
            const baseVal = ctx.getVal(3, '뎀증');
            bonuses["뎀증"] += (baseVal * huntStacks) * (1 / ctx.targetCount);
        }

        // [패시브3] 분노의 해류: 피격 시 뎀증 (최대 3중첩)
        if (ctx.simState.skill5_timer.length > 0) {
            bonuses["뎀증"] += ctx.simState.skill5_timer.length * ctx.getVal(4, '뎀증');
        }

        // [도장] 필살기 뎀증
        if (ctx.simState.skill8_buff_timer > 0) {
            bonuses["필살기뎀증"] += ctx.getVal(7, '필살기뎀증', true);
        }

        return bonuses;
    }
  },
  "orem": {
    commonControls: ["orem_hit_count"],
    customControls: [
        { id: "self_extra_dmg_active", type: "toggle", label: "추가데미지 본인적용", initial: false, description: "체크 시 본인이 배리어를 보유한 상태에서 공격할 경우 도장 패시브(25% 추가타)를 파티원 기여분 포함하여 계산에 포함합니다." }
    ],
    initialState: {
        shield_timer: 0,
        skill4_timer: 0
    },
    onAttack: (ctx) => {
        return { extraHits: [] };
    },
    onAfterAction: (ctx) => {
        const extraHits = [];
        if (!ctx.customValues.self_extra_dmg_active || !ctx.stats.stamp) return { extraHits };

        // [수정] onAfterAction으로 이동하여 필살기 로그 이후에 출력되도록 함
        // 이미 onAttack의 sim_params에서 shield_timer가 갱신되었으므로 수동 설정 불필요

        // 2. 배리어 상태 체크 및 추가타 생성
        if (ctx.simState.shield_timer > 0) {
            const oremExtraCoef = 25; // 도장 효과 25%
            const loopCount = 4; // 필살/보통공격 관계없이 아군 4인분으로 고정
            
            for (let i = 0; i < loopCount; i++) {
                extraHits.push({
                    name: `오렘: 현측 방어 전개 (아군 #${i+1})`,
                    skillId: "orem_skill8",
                    val: oremExtraCoef,
                    type: "추가공격",
                    customTag: "도장",
                    icon: "images/sigilwebp/sigil_orem.webp"
                });
            }
        }
        return { extraHits };
    },
    onEnemyHit: (ctx) => {
        const extraHits = [];
        // 배리어가 있을 때만 반사 데미지 발생
        if (ctx.simState.shield_timer > 0) {
            const hitCount = parseInt(ctx.customValues.orem_hit_count || 0);
            if (hitCount > 0) {
                const reflectCoef = ctx.getVal(6, '추가데미지'); // 50%
                for (let i = 0; i < hitCount; i++) {
                    extraHits.push({
                        name: `오렘: 충격 역류 (반사 #${i+1})`,
                        skillId: "orem_skill7",
                        val: reflectCoef,
                        type: "추가공격",
                        customTag: "패시브5",
                        icon: "icon/passive5.webp"
                    });
                }
            }
        }
        return { extraHits };
    },
    getLiveBonuses: (ctx) => {
        const bonuses = { "배리어증가": 0 };
        // [패시브2] 배리어 강화 효과 합산
        if (ctx.simState.skill4_timer > 0) {
            bonuses["배리어증가"] += ctx.getVal(3, '배리어증가');
        }
        return bonuses;
    }
  },
  "jetblack": {
    stateDisplay: {
        "skill4_stacks": "[체력응축]"
    },
    commonControls: [],
    initialState: {
        skill4_stacks: 0, // 명칭 변경
        skill1_timer: 0,
        skill2_timer: 0,
        skill5_timer: 0
    },
    onTurn: (ctx) => {
        // 1+3n턴(1턴 제외)은 아군 필살기 턴이므로 보통공격 트리거 미발생
        const isAllyUltTurn = (ctx.t > 1 && (ctx.t - 1) % 3 === 0);
        
        if (!isAllyUltTurn) {
            const allyCount = 4;
            for (let i = 0; i < allyCount; i++) {
                ctx.checkStackTriggers("ally_attack");
            }
        }
    },
    onAttack: (ctx) => {
        // 모든 로직이 sim_params.js로 이관됨
        return { extraHits: [] };
    },
    onAfterAction: (ctx) => {
        return { extraHits: [] };
    },
    getLiveBonuses: (ctx) => {
        const bonuses = { "고정공증": 0, "트리거뎀증": 0 };
        const baseAtk = ctx.baseStats ? ctx.baseStats["공격력"] : 0;
        
        // 1. [스킬1] 보통공격 후 고정공증 (30%)
        if (ctx.simState.skill1_timer > 0) {
            // 기초공격력의 n% 만큼 가산
            const rate = ctx.getVal(0, 'max');
            bonuses["고정공증"] += baseAtk * (rate / 100);
        }

        // 2. [스킬2] 필살기 후 고정공증 (15%) 및 트리거뎀증 (30%)
        if (ctx.simState.skill2_timer > 0) {
            // 기초공격력의 n% 만큼 가산 (calc[0])
            const rate = ctx.getVal(1, 0); 
            bonuses["고정공증"] += baseAtk * (rate / 100);
            
            // 발동 스킬 효과 증가 (calc[1])
            bonuses["트리거뎀증"] += ctx.getVal(1, 1);
        }

        // 3. [스킬5] 확률형 트리거뎀증 (24%)
        if (ctx.simState.skill5_timer > 0) {
            bonuses["트리거뎀증"] += ctx.getVal(4, '트리거뎀증'); // buffEffects 참조
        }

        return bonuses;
    }
  },
  "famido": {
    stateDisplay: {
        "tactical_stacks": "[전술 판독]"
    },
    customControls: [
        { id: "ally_hit_prob", type: "input", label: "아군 피격 확률(%)", min: 0, max: 100, initial: 30, description: "매 턴 아군 4명이 각각 공격받을 확률입니다." }
    ],
    initialState: {
        tactical_stacks: 0,
        skill2_timer: 0,
        skill2_fixed_timer: 0,
        skill4_timer: 0,
        skill5_timer: [],
        skill4_boost_timer: 0
    },
    onTurn: (ctx) => {
        // 1. [포지션3 고정] 매턴 전술 판독 1스택 획득
        ctx.gainStack({ id: "tactical_stacks", originalId: "famido_skill4", maxStacks: 3, label: "[전술 판독] 획득", customTag: "패시브2" });
    },
    onEnemyHit: (ctx) => {
        // 아군 4명 피격 시뮬레이션 (5스킬 스택 수급)
        // 본인 피격 여부와 상관없이 엔진 예외처리에 의해 매턴 실행됨
        const hitProb = (ctx.customValues.ally_hit_prob || 0) / 100;
        for (let i = 0; i < 4; i++) {
            if (Math.random() < hitProb) {
                ctx.checkBuffTriggers("ally_hit");
            }
        }
    },
    onAfterAction: (ctx) => {
        // ... (필요 시 다른 로직 추가)
    },
    getLiveBonuses: (ctx) => {
        const bonuses = { "기초공증": 0, "고정공증": 0 };
        
        // 1. 기초공증 합산 (스택형: 스킬 2, 4, 5) - 스킬 6(15%)은 엔진이 자동 합산
        if (ctx.simState.skill2_timer > 0) bonuses["기초공증"] += ctx.getVal(1, 0);
        if (ctx.simState.skill4_timer > 0) bonuses["기초공증"] += ctx.getVal(3, 0);
        
        const s5Stacks = (ctx.simState.skill5_timer || []).length;
        if (s5Stacks > 0) bonuses["기초공증"] += s5Stacks * ctx.getVal(4, '기초공증');

        // 2. 현재 기초공격력 계산 (가산 버프의 기준점)
        const br = Number(ctx.stats.s1) || 0;
        const totalBaseAtkRate = 100 + (br >= 50 ? 15 : 0) + bonuses["기초공증"];
        const currentBaseAtk = ctx.baseStats["공격력"] * (totalBaseAtkRate / 100);

        // 3. 고정공증 합산 (필살기 도장 + 4스킬 전술 판독)
        // [필살기 도장] 전용 타이머(skill2_fixed_timer)를 체크하여 후적용 보장
        if (ctx.stats.stamp && ctx.simState.skill2_fixed_timer > 0) {
            bonuses["고정공증"] += currentBaseAtk * (ctx.getVal(1, 2) / 100);
        }
        // [4스킬 전술 판독]
        if (ctx.simState.skill4_boost_timer > 0) {
            bonuses["고정공증"] += currentBaseAtk * (ctx.getVal(3, 1) / 100);
        }

        return bonuses;
    }
  },
  "rikano": {
    getLiveBonuses: (ctx) => {
        const bonuses = { "공증": 0, "뎀증디버프": 0, "필살기뎀증": 0 };
        
        // 1. 공증/필살기뎀증
        // 스킬 3(18%)과 스킬 4(13.8%)는 엔진이 defaultBuffSkills를 통해 자동으로 합산하므로 수동 추가 제외

        // 2. 뎀증디버프 합산 (중첩 가능)
        if (ctx.simState.skill1_timer > 0) bonuses["뎀증디버프"] += ctx.getVal(0, 0);
        if (ctx.simState.skill2_timer > 0) bonuses["뎀증디버프"] += ctx.getVal(1, 0, !!ctx.stats.stamp);
        if (ctx.simState.skill8_timer > 0) bonuses["뎀증디버프"] += ctx.getVal(7, 0);

        return bonuses;
    }
  },
  "duncan": {
    initialState: {
        skill8_stacks: 0,
        skill2_timer: 0,
        skill4_timer: 0,
        skill9_timer: 0,
        skill5_timer: 0
    },
    getLiveBonuses: (ctx) => {
        const bonuses = { "공증": 0, "뎀증": 0, "평타뎀증": 0 };
        
        // 1. 공증 합산
        // [스킬2] 필살기 사용 시 공증 (30%)
        if (ctx.simState.skill2_timer > 0) bonuses["공증"] += ctx.getVal(1, 0);
        // [스킬4] 보통공격 시 확정 공증 (16%)
        if (ctx.simState.skill4_timer > 0) bonuses["공증"] += ctx.getVal(3, 0);
        // [스킬9] 보통공격 시 확률 공증 (32%)
        if (ctx.simState.skill9_timer > 0) bonuses["공증"] += ctx.getVal(8, 0);

        // 2. 뎀증 합산 (마도 집중)
        // [스킬8] 스택 2 이상 시 뎀증 150%
        if (ctx.simState.skill8_stacks >= 2) bonuses["뎀증"] += ctx.getVal(7, 0);

        // 3. 평타뎀증 합산
        // [스킬7] 상시 평타뎀증 (45%)
        // (엔진이 자동 합산하므로 여기서는 빈 객체 유지 또는 다른 조건 필요 시 사용)
        
        return bonuses;
    }
  },
  "rutenix": {
    customControls: [
        { id: "self_buff_mode", type: "toggle", label: "필살버프 자가 적용", initial: false, description: "체크 시 필살기의 공격력 흡수 버프를 본인이 받습니다." }
    ],
    commonControls: ["hit_prob"],
    initialState: {
        skill2_timer: 0,
        skill4_timer: [],
        skill5_timer: 0,
        skill7_timer: []
    },
    onTurn: (ctx) => {
        // 아군 4명 기준으로 트리거 발생 (1+3n턴 제외)
        const isAllyUltTurn = (ctx.t > 1 && (ctx.t - 1) % 3 === 0);
        if (!isAllyUltTurn) {
            const allyCount = 4;
            for (let i = 0; i < allyCount; i++) {
                ctx.checkBuffTriggers("ally_attack");
            }
        }
    },
    getLiveBonuses: (ctx) => {
        const bonuses = { "기초공증": 0, "고정공증": 0 };
        
        // 1. 기초공증 합산 (스택형: 스킬 4, 5, 7)
        // [스킬4] 보통공격 시 15% (최대 2중첩)
        const s4Stacks = (ctx.simState.skill4_timer || []).length;
        if (s4Stacks > 0) bonuses["기초공증"] += s4Stacks * ctx.getVal(3, 1);
        
        // [스킬5] 피격 시 30% (1중첩)
        if (ctx.simState.skill5_timer > 0) bonuses["기초공증"] += ctx.getVal(4, '기초공증');
        
        // [스킬7] 아군 보통공격 시 12% (최대 4중첩)
        const s7Stacks = (ctx.simState.skill7_timer || []).length;
        if (s7Stacks > 0) bonuses["기초공증"] += s7Stacks * ctx.getVal(6, '기초공증');

        // 2. 상시 기초공증 (패시브4: 스킬6) - 4성(50단계) 해금 체크
        const br = Number(ctx.stats.s1) || 0;
        let passiveBaseAtkRate = 0;
        if (br >= 50) {
            passiveBaseAtkRate = ctx.getVal(5, '기초공증');
        }

        // 3. [스킬2] 필살기 고정공증 계산 (자가 수급 모드일 때만)
        if (ctx.customValues.self_buff_mode && ctx.simState.skill2_timer > 0) {
            // 현재의 '진짜 기초공격력' 계산 (기본값 + 상시 패시브 + 실시간 스택)
            const totalBaseAtkRate = 100 + passiveBaseAtkRate + bonuses["기초공증"];
            const currentBaseAtk = ctx.baseStats["공격력"] * (totalBaseAtkRate / 100);
            
            // 도장 여부에 따른 배율 가져오기 (45% vs 90%)
            const isStamped = !!ctx.stats.stamp; 
            const boostRate = ctx.getVal(1, 0, isStamped); 
            bonuses["고정공증"] += currentBaseAtk * (boostRate / 100);
        }

        return bonuses;
    }
  },
  "kumoyama": {
    commonControls: ["hit_prob"],
    // [범용] 조롱 상태 여부 반환 (엔진 피격 로직 연동)
    isTaunted: (ctx) => ctx.simState.skill2_taunt_timer > 0 ? "taunt" : false,
    
    initialState: {
        skill2_taunt_timer: 0,
        skill4_timer: 0,
        skill5_timer: 0,
        skill7_timer: 0
    },
    // 1. 공격
    onAttack: (ctx) => {
        if (ctx.isUlt) {
            // 필살기 사용 시 조롱 상태 부여 (1턴)
            ctx.setTimer("skill2_taunt_timer", 1);
            ctx.log("taunt", "activate");
        }
        return { extraHits: [] };
    },
    // 2. 피격
    onEnemyHit: (ctx) => {
        // [자동화] 반격 로직은 sim_params 설정을 통해 엔진이 자동으로 처리합니다.
        return { extraHits: [] };
    },
    // 3. 실시간 보너스
    getLiveBonuses: (ctx) => {
        const bonuses = { "뎀증": 0 };

        // [패시브2] 만상
        if (ctx.simState.skill4_timer > 0) {
            bonuses["뎀증"] += ctx.getVal(3, '뎀증');
        }
        // [패시브3] 발도
        if (ctx.simState.skill5_timer > 0) {
            bonuses["뎀증"] += ctx.getVal(4, '뎀증');
        }
        // [패시브5] 수파리
        if (ctx.simState.skill7_timer > 0) {
            bonuses["뎀증"] += ctx.getVal(6, 'max'); // calc[0] 값 가져옴
        }

        return bonuses;
    }
  },
  "beernox": {
    stateDisplay: {
        "skill7_stacks": "[타임 체크]"
    },
    customControls: [
        { id: "wood_party_active", type: "toggle", label: "나무속성 파티원 3인", initial: false, description: "체크 시 나무속성 아군 3인 이상 조건을 만족한 것으로 간주하여 데미지가 15% 증가합니다." }
    ],
    initialState: {
        skill7_stacks: 0,
        skill1_timer: 0,
        skill2_timer: 0,
        skill2_stamp_timer: 0
    },
    onTurn: (ctx) => {
        // [수정] 2턴부터 타임 체크 스택 획득
        if (ctx.t > 1 && ctx.simState.skill7_stacks < 15) {
            ctx.gainStack({ id: "skill7_stacks", originalId: "beernox_skill7", maxStacks: 15, label: "[타임 체크] 획득", customTag: "패시브6" });
        }
    },
    getLiveBonuses: (ctx) => {
        const bonuses = { "기초공증": 0, "고정공증": 0, "뎀증": 0 };
        
        // 1. [패시브3] 나무속성 파티원 조건 체크
        if (ctx.customValues.wood_party_active) {
            bonuses["뎀증"] += ctx.getVal(3, '뎀증'); // 스킬4 뎀증 15%
        }

        // 2. 기초공증 합산 (매턴 쌓이는 타임 체크 스택)
        const timeStacks = Number(ctx.simState.skill7_stacks) || 0;
        bonuses["기초공증"] += timeStacks * ctx.getVal(6, '기초공증');

        // 2. 현재 기초공격력 계산 (가산 수치의 기준점)
        // 기본 100% + 스킬6(15%) + 타임체크 스택
        const br = Number(ctx.stats.s1) || 0;
        const totalBaseAtkRate = 100 + (br >= 50 ? 15 : 0) + bonuses["기초공증"];
        const currentBaseAtk = ctx.baseStats["공격력"] * (totalBaseAtkRate / 100);

        // 3. 고정공증 합산 (스킬 1, 2)
        if (ctx.simState.skill1_timer > 0) {
            bonuses["고정공증"] += currentBaseAtk * (ctx.getVal(0, 0) / 100);
        }
        if (ctx.simState.skill2_timer > 0) {
            bonuses["고정공증"] += currentBaseAtk * (ctx.getVal(1, 0) / 100);
        }
        // [도장] 2배 효과 (추가 60% 가산)
        if (ctx.simState.skill2_stamp_timer > 0) {
            bonuses["고정공증"] += currentBaseAtk * (ctx.getVal(1, 0) / 100);
        }

        return bonuses;
    }
  }
};