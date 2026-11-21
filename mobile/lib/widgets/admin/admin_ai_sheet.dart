import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../services/admin_ai_service.dart';

const _welcome =
    'សួស្ដី — ខ្ញុំជួយគ្រប់គ្រង The Man Store Admin។\n\n'
    'សួរអំពី revenue, orders, stock, customers — ជាខ្មែរឬអង់គ្លេសបាន។';

const _suggestions = [
  'How much revenue today?',
  'What products sold best in the last 30 days?',
  'How many pending orders?',
  'តើលក់បានប៉ុន្មានថ្ងៃនេះ?',
  'Which products are low on stock?',
];

void showAdminAiSheet(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => const _AdminAiSheet(),
  );
}

class _AdminAiSheet extends StatefulWidget {
  const _AdminAiSheet();

  @override
  State<_AdminAiSheet> createState() => _AdminAiSheetState();
}

class _ChatMsg {
  _ChatMsg({required this.role, required this.text});
  final String role;
  final String text;
}

class _AdminAiSheetState extends State<_AdminAiSheet> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _messages = <_ChatMsg>[_ChatMsg(role: 'assistant', text: _welcome)];
  String? _conversationId;
  bool _loading = false;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    });
  }

  Future<void> _send([String? text]) async {
    final msg = (text ?? _input.text).trim();
    if (msg.isEmpty || _loading) return;
    setState(() {
      _messages.add(_ChatMsg(role: 'user', text: msg));
      _loading = true;
      _input.clear();
    });
    _scrollToEnd();
    try {
      final reply = await AdminAiService(context.read<ApiClient>()).chat(message: msg, conversationId: _conversationId);
      if (!mounted) return;
      setState(() {
        _conversationId = reply.conversationId ?? _conversationId;
        _messages.add(_ChatMsg(role: 'assistant', text: reply.reply.isNotEmpty ? reply.reply : 'No reply from AI.'));
        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      final api = context.read<ApiClient>();
      setState(() {
        _messages.add(_ChatMsg(role: 'assistant', text: '⚠️ ${api.apiMessage(e)}'));
        _loading = false;
      });
    }
    _scrollToEnd();
  }

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    final maxH = MediaQuery.sizeOf(context).height * 0.88;

    return SizedBox(
      height: maxH,
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Theme.of(context).dividerColor, borderRadius: BorderRadius.circular(4))),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 12, 8),
            child: Row(
              children: [
                Icon(Icons.auto_awesome_rounded, color: primary, size: 22),
                const SizedBox(width: 10),
                Expanded(child: Text('Ask AI', style: Theme.of(context).textTheme.titleMedium)),
                IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded)),
              ],
            ),
          ),
          if (_messages.length <= 1)
            SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: _suggestions.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) => ActionChip(
                  label: Text(_suggestions[i], style: const TextStyle(fontSize: 11)),
                  onPressed: () => _send(_suggestions[i]),
                ),
              ),
            ),
          const SizedBox(height: 8),
          Expanded(
            child: ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: _messages.length + (_loading ? 1 : 0),
              itemBuilder: (_, i) {
                if (i >= _messages.length) {
                  return const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator()));
                }
                final m = _messages[i];
                final isUser = m.role == 'user';
                return Align(
                  alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.82),
                    decoration: BoxDecoration(
                      color: isUser ? primary.withValues(alpha: 0.14) : Theme.of(context).cardTheme.color,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Theme.of(context).dividerColor.withValues(alpha: 0.6)),
                    ),
                    child: Text(m.text, style: GoogleFonts.inter(fontSize: 13, height: 1.45)),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, MediaQuery.viewInsetsOf(context).bottom + 12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _input,
                    minLines: 1,
                    maxLines: 3,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _send(),
                    decoration: const InputDecoration(hintText: 'Ask about sales, stock, orders…'),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(onPressed: _loading ? null : () => _send(), child: const Icon(Icons.send_rounded, size: 20)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
