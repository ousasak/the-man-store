import '../core/api_client.dart';

class AdminAiReply {
  AdminAiReply({required this.reply, this.conversationId});

  final String reply;
  final String? conversationId;

  factory AdminAiReply.fromJson(Map<String, dynamic> json) {
    return AdminAiReply(
      reply: (json['reply'] ?? '').toString(),
      conversationId: json['conversation_id']?.toString(),
    );
  }
}

class AdminAiService {
  AdminAiService(this._api);

  final ApiClient _api;

  Future<AdminAiReply> chat({required String message, String? conversationId}) async {
    final res = await _api.dio.post('/ai/chat', data: {
      'message': message,
      if (conversationId != null && conversationId.isNotEmpty) 'conversation_id': conversationId,
    });
    return AdminAiReply.fromJson(Map<String, dynamic>.from(res.data as Map));
  }
}
