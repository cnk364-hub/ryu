/**
 * Context Agent 테스트
 * 실행: node agents/context/test.js
 */

const { ContextAgent } = require('./index');
const simulator = require('../../mock-data/simulator');

async function runTest() {
  console.log('=== Context Agent 테스트 ===\n');

  const agent = new ContextAgent({ anomalyThreshold: 0.6 });

  // -------------------------------------------------------
  // 테스트 1: ASF 질병 시나리오 (급이량 급감)
  // -------------------------------------------------------
  console.log('--- 테스트 1: ASF 질병 시나리오 ---');
  const asfData = simulator.generateFeedingData('disease_asf');
  const asfEnv = simulator.generateEnvironmentData('disease_asf');

  // 정상 데이터로 모델 학습
  agent.train(asfData.slice(0, 24)); // 정상 기간 (24일)

  const asfResult = await agent.analyze({
    feedingData: asfData,           // 전체 30일 (마지막 6일 이상)
    environmentData: asfEnv,
    farmInfo: { name: '제일축산 1호동', type: 'pig' },
    livestockInfo: {
      breed: 'LYD',
      headCount: 120,
      avgWeight: 95,
      avgAge: 150,
      recentMortality: 0.3,
      feedType: '비육후기사료',
    },
  });

  console.log('위험 수준:', asfResult.result.risk_level);
  console.log('이상 탐지:', asfResult.result.anomaly_detection.is_anomaly);
  console.log('이상 점수:', asfResult.result.anomaly_detection.anomaly_score);
  console.log('이상 일수:', asfResult.result.anomaly_detection.anomaly_days);
  console.log('위험 지표:', asfResult.result.risk_indicators);
  console.log('상황 요약:', asfResult.result.situation_summary);
  console.log('급이 분석:', JSON.stringify(asfResult.result.feeding_analysis, null, 2));
  console.log('처리 시간:', asfResult.duration_ms + 'ms');
  console.log();

  // -------------------------------------------------------
  // 테스트 2: 고온 스트레스 시나리오
  // -------------------------------------------------------
  console.log('--- 테스트 2: 고온 스트레스 시나리오 ---');
  const heatData = simulator.generateFeedingData('environment_heat');
  const heatEnv = simulator.generateEnvironmentData('environment_heat');

  const agent2 = new ContextAgent();
  const heatResult = await agent2.analyze({
    feedingData: heatData,
    environmentData: heatEnv,
    farmInfo: { name: '제일축산 1호동', type: 'pig' },
  });

  console.log('위험 수준:', heatResult.result.risk_level);
  console.log('환경 분석:', JSON.stringify(heatResult.result.environment_analysis, null, 2));
  console.log('상황 요약:', heatResult.result.situation_summary);
  console.log('처리 시간:', heatResult.duration_ms + 'ms');
  console.log();

  // -------------------------------------------------------
  // 테스트 3: 정상 시나리오 (출하 최적화)
  // -------------------------------------------------------
  console.log('--- 테스트 3: 정상 시나리오 ---');
  const normalData = simulator.generateFeedingData('shipment_optimization');
  const normalEnv = simulator.generateEnvironmentData('shipment_optimization');

  const agent3 = new ContextAgent();
  const normalResult = await agent3.analyze({
    feedingData: normalData,
    environmentData: normalEnv,
    farmInfo: { name: '제일축산 1호동', type: 'pig' },
  });

  console.log('위험 수준:', normalResult.result.risk_level);
  console.log('이상 탐지:', normalResult.result.anomaly_detection.is_anomaly);
  console.log('상황 요약:', normalResult.result.situation_summary);
  console.log('처리 시간:', normalResult.duration_ms + 'ms');
  console.log();

  // -------------------------------------------------------
  // 결과 요약
  // -------------------------------------------------------
  console.log('=== 테스트 결과 요약 ===');
  console.log('ASF 시나리오  → 위험수준:', asfResult.result.risk_level,
    '| 이상탐지:', asfResult.result.anomaly_detection.is_anomaly ? 'O' : 'X');
  console.log('고온 시나리오 → 위험수준:', heatResult.result.risk_level,
    '| 환경경보:', heatResult.result.environment_analysis.alerts.length + '건');
  console.log('정상 시나리오 → 위험수준:', normalResult.result.risk_level,
    '| 이상탐지:', normalResult.result.anomaly_detection.is_anomaly ? 'O' : 'X');

  // 기대 결과 검증
  const pass = asfResult.result.risk_level === 'emergency'
    && heatResult.result.environment_analysis.status === 'critical'
    && normalResult.result.risk_level === 'normal';

  console.log('\n전체 테스트:', pass ? 'PASS ✓' : 'FAIL ✗');
}

runTest().catch(console.error);
