
class Expo {
  static isExpoPushToken() {
    return true;
  }
  async sendPushNotificationsAsync() {
    return [];
  }
  async getPushNotificationReceiptsAsync() {
    return {};
  }
  chunkPushNotifications(messages) {
    return [messages];
  }
}

module.exports = Expo;
module.exports.default = Expo;
module.exports.Expo = Expo;
