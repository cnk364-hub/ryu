/**
 * Alert Service - 경보 메시지 생성 및 전송 관리
 *
 * 기능:
 * - 위험 단계별 경보 메시지 자동 생성
 * - 다채널 전송 (SMS, 카카오톡, 시스템 알림, 이메일)
 * - 전송 이력 관리
 * - 반복 알림 워크플로우
 *
 * 실제 전송은 외부 API 연동 필요 (현재 시뮬레이션)
 */

class AlertService {
  constructor(config = {}) {
    this.config = {
      smsEndpoint: config.smsEndpoint || null,
      kakaoEndpoint: config.kakaoEndpoint || null,
      emailEndpoint: config.emailEndpoint || null,
      ...config,
    };
    this.alertHistory = [];
    this.alertId = 0;
  }

  /**
   * 경보 메시지 생성
   *
   * @param {Object} params
   * @param {string} params.riskLevel - 위험 단계
   * @param {string} params.situation - 상황 요약
   * @param {Array} params.actions - 즉시 조치 사항
   * @param {Object} params.farmInfo - 농장 정보
   * @param {Object} params.contacts - 연락처 정보
   * @returns {Object} 생성된 경보 메시지들
   */
  generateAlerts(params) {
    const { riskLevel, situation, actions, farmInfo, contacts } = params;

    const alerts = [];

    // 1. 농장주 알림
    alerts.push(this._createFarmerAlert(riskLevel, situation, actions, farmInfo));

    // 2. 수의사 알림 (K3, K4)
    if (['K3', 'K4', 'danger', 'emergency'].includes(riskLevel)) {
      alerts.push(this._createVetAlert(riskLevel, situation, farmInfo));
    }

    // 3. 방역 당국 알림 (K4)
    if (['K4', 'emergency'].includes(riskLevel)) {
      alerts.push(this._createAuthorityAlert(riskLevel, situation, farmInfo));
    }

    // 4. 현장 관리자 작업지시
    alerts.push(this._createStaffDirective(riskLevel, actions, farmInfo));

    return alerts;
  }

  /**
   * 경보 전송 (시뮬레이션 / 실제 API 연동 가능)
   */
  async sendAlert(alert) {
    this.alertId++;
    const record = {
      alertId: `ALERT-${String(this.alertId).padStart(4, '0')}`,
      ...alert,
      sentAt: new Date().toISOString(),
      status: 'sent',
      deliveryResults: [],
    };

    // 채널별 전송
    for (const channel of alert.channels) {
      const result = await this._sendViaChannel(channel, alert);
      record.deliveryResults.push(result);
    }

    record.status = record.deliveryResults.every(r => r.success) ? 'delivered' : 'partial';
    this.alertHistory.push(record);

    return record;
  }

  /**
   * 전송 이력 조회
   */
  getHistory(filter = {}) {
    let history = this.alertHistory;
    if (filter.riskLevel) history = history.filter(a => a.riskLevel === filter.riskLevel);
    if (filter.target) history = history.filter(a => a.target === filter.target);
    if (filter.since) history = history.filter(a => new Date(a.sentAt) >= new Date(filter.since));
    return history;
  }

  /**
   * 농장주 알림 메시지
   */
  _createFarmerAlert(riskLevel, situation, actions, farmInfo) {
    const farmName = farmInfo?.name || '농장';
    const levelLabel = { K1: '정상', K2: '주의', K3: '위험', K4: '긴급', normal: '정상', caution: '주의', danger: '위험', emergency: '긴급' };
    const label = levelLabel[riskLevel] || riskLevel;

    let message = '';
    if (riskLevel === 'K4' || riskLevel === 'emergency') {
      message = `[긴급경보] ${farmName}\n\n`;
      message += `${situation}\n\n`;
      message += `즉시 조치:\n`;
      (actions || []).slice(0, 4).forEach((a, i) => {
        const text = typeof a === 'string' ? a : a.action;
        message += `${i + 1}. ${text}\n`;
      });
      message += `\n수의사 긴급 호출이 요청되었습니다.\n방역 당국에 신고가 필요합니다.`;
    } else if (riskLevel === 'K3' || riskLevel === 'danger') {
      message = `[경고] ${farmName}\n\n${situation}\n\n조치가 필요합니다. 시스템에서 상세 계획을 확인하세요.`;
    } else if (riskLevel === 'K2' || riskLevel === 'caution') {
      message = `[주의] ${farmName}\n\n${situation}\n\n모니터링을 강화하고 원인을 확인하세요.`;
    } else {
      message = `[안내] ${farmName}\n\n현재 상태가 정상입니다. 정기 모니터링을 유지하세요.`;
    }

    return {
      target: 'farmer',
      riskLevel,
      levelLabel: label,
      message,
      channels: this._getChannels(riskLevel, 'farmer'),
      priority: riskLevel === 'K4' ? 'critical' : riskLevel === 'K3' ? 'high' : 'normal',
    };
  }

  /**
   * 수의사 알림 메시지
   */
  _createVetAlert(riskLevel, situation, farmInfo) {
    const farmName = farmInfo?.name || '농장';

    let message = `[수의사 ${riskLevel === 'K4' ? '긴급 호출' : '참고 통보'}]\n`;
    message += `농장: ${farmName}\n\n`;
    message += `${situation}\n\n`;

    if (riskLevel === 'K4' || riskLevel === 'emergency') {
      message += '즉시 현장 방문 및 시료 채취 요청.';
    } else {
      message += '상황 미개선 시 현장 방문 요청 예정.';
    }

    return {
      target: 'vet',
      riskLevel,
      message,
      channels: this._getChannels(riskLevel, 'vet'),
      priority: riskLevel === 'K4' ? 'critical' : 'high',
    };
  }

  /**
   * 방역 당국 알림 (K4 긴급)
   */
  _createAuthorityAlert(riskLevel, situation, farmInfo) {
    const farmName = farmInfo?.name || '농장';

    return {
      target: 'quarantine_authority',
      riskLevel,
      message: `[가축방역기관 긴급 신고]\n농장: ${farmName}\n\n${situation}\n\n즉시 역학조사 및 정밀검사 요청.`,
      channels: [{ type: 'system', endpoint: 'quarantine_api' }, { type: 'sms' }],
      priority: 'critical',
    };
  }

  /**
   * 현장 관리자 작업지시
   */
  _createStaffDirective(riskLevel, actions, farmInfo) {
    let message = `[작업지시] ${farmInfo?.name || '농장'}\n\n`;

    const taskList = (actions || []).map((a, i) => {
      const text = typeof a === 'string' ? a : a.action;
      const responsible = a.responsible || '';
      const deadline = a.deadline || '';
      return `${i + 1}. ${text}${responsible ? ` [${responsible}]` : ''}${deadline ? ` (${deadline})` : ''}`;
    });

    message += taskList.join('\n');

    return {
      target: 'farm_staff',
      riskLevel,
      message,
      channels: [{ type: 'push' }, { type: 'system' }],
      priority: riskLevel === 'K4' ? 'critical' : 'normal',
    };
  }

  /**
   * 채널 결정 (위험 단계 + 대상별)
   */
  _getChannels(riskLevel, target) {
    if (riskLevel === 'K4' || riskLevel === 'emergency') {
      return [{ type: 'sms' }, { type: 'kakao' }, { type: 'push' }, { type: 'call' }];
    }
    if (riskLevel === 'K3' || riskLevel === 'danger') {
      return [{ type: 'sms' }, { type: 'kakao' }, { type: 'push' }];
    }
    if (riskLevel === 'K2' || riskLevel === 'caution') {
      return [{ type: 'kakao' }, { type: 'push' }];
    }
    return [{ type: 'push' }];
  }

  /**
   * 채널별 전송 (시뮬레이션)
   * 실제 운영 시 SMS API, 카카오 API 등 연동
   */
  async _sendViaChannel(channel, alert) {
    // 실제 API 연동 포인트
    if (channel.type === 'sms' && this.config.smsEndpoint) {
      // return await this._sendSMS(this.config.smsEndpoint, alert);
    }
    if (channel.type === 'kakao' && this.config.kakaoEndpoint) {
      // return await this._sendKakao(this.config.kakaoEndpoint, alert);
    }

    // 시뮬레이션 (로그)
    return {
      channel: channel.type,
      success: true,
      timestamp: new Date().toISOString(),
      simulated: true,
    };
  }
}

module.exports = { AlertService };
