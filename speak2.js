// 口說 2.14：補句子（每課 14～16 句、每句一個考點）、對比組（聽出差別、念出差別）、問答（App 問、學生自己回答）。全部自編。
// 難度 lv：1 易（短句、基本）、2 中（完整句型）、3 難（長句、對比、要自己換人稱）

// 補進各課的句子：[英文, 中文, 發音或考點提醒, lv]
export const SPEAK_MORE = {
  Starter: [
    ['Thank you very much.', '非常謝謝你。', 'th 舌尖輕碰上排牙齒', 1],
    ['Sit down, please.', '請坐下。', '', 1],
    ['Excuse me, are you Mr. Wang?', '不好意思，你是王先生嗎？', 'Excuse 的 x 念 /ks/；問句尾音上揚', 2],
    ['How old is your brother? He is fifteen.', '你哥哥幾歲？他十五歲。', 'fifteen 重音在後：fif-TEEN', 2],
  ],
  'Unit 3': [
    ["Don't be late for school.", '上學不要遲到。', "Don't be：形容詞前面的 be 不能少", 2],
    ["Let's take a picture here.", '我們在這裡拍張照吧。', 'picture 的 c 念 /k/', 2],
    ['Can you swim? Yes, I can.', '你會游泳嗎？會。', '問句的 can 輕讀，簡答的 can 重讀', 2],
    ["I can't ride a bike, but I can run fast.", '我不會騎腳踏車，但我跑得很快。', "can't 重讀、can 輕讀：聽的人靠這個分辨", 3],
    ['Give it to me, please.', '請把它給我。', 'it、me 都是受格', 1],
    ['Open the door for them.', '幫他們開門。', 'them 是受格，不是 they', 1],
  ],
  'Unit 4': [
    ["It's a quarter to nine.", '現在八點四十五分。', 'quarter 的 qu 念 /kw/；to ＝ 差 15 分', 3],
    ['The concert is at seven thirty.', '演唱會在七點半。', 'at 幾點', 2],
    ['Today is Wednesday.', '今天星期三。', 'Wednesday 的 d 不發音：WENZ-day', 2],
    ['The party is on Thursday night.', '派對在星期四晚上。', 'Thursday 的 th 不震動；on 星期幾', 2],
    ['My brother is playing basketball now.', '我哥哥現在在打籃球。', 'playing 的 -ing 要念出來', 2],
    ['Is she sleeping? No, she is reading.', '她在睡覺嗎？不，她在看書。', '進行式：be ＋ V-ing，問句 be 放前面', 3],
  ],
  'Unit 5': [
    ["New Year's Day is on January first.", '元旦是一月一日。', 'January 四個音節：JAN-u-ar-y', 2],
    ["It's the fifth of May.", '五月五日。', 'fifth 的 fth 連著念', 2],
    ["What month is it? It's April.", '現在幾月？四月。', 'April 重音在前', 1],
    ['Her birthday is in June, not July.', '她的生日在六月，不是七月。', 'June／July 開頭一樣，聽後面', 3],
    ['Today is the fifteenth. Tomorrow is the sixteenth.', '今天十五號，明天十六號。', '-teenth 重音在後', 3],
    ["Teachers' Day is on September twenty-eighth.", '教師節是九月二十八日。', 'eighth 念 /eɪtθ/，不是 eight-th', 3],
  ],
  'Unit 6': [
    ["Don't feed the animals.", '不要餵動物。', 'feed 的 ee 念長音', 1],
    ["There is a bird on the elephant's back.", '大象的背上有一隻鳥。', "elephant's 的 s 要念出來", 2],
    ['There is some water in the bottle.', '瓶子裡有一些水。', 'water 不可數 → There is', 2],
    ['Look at the giraffe. It is very tall.', '看那隻長頸鹿，牠很高。', 'giraffe 重音在後：gi-RAFFE', 2],
    ["Are there any birds in the sky? No, there aren't.", '天空中有鳥嗎？沒有。', "問句用 any；aren't 的 t 輕輕帶過", 3],
    ['How many pandas are there? There is only one.', '有幾隻熊貓？只有一隻。', '問句是複數，答句一隻 → There is', 3],
  ],
}
// 含金量低、拿掉的句子
export const SPEAK_DROP = new Set(["Let's go take a look.", 'How about you?', "I'm full, thanks.", 'See you tomorrow.'])

// 對比組：兩句只差一個音或一個字，先聽出是哪一句，再念出來。[句子 A, 句子 B, 中文 A, 中文 B, 差別提醒, lv]
export const SPEAK_PAIRS = {
  Starter: [
    ['I am thirteen.', 'I am thirty.', '我十三歲。', '我三十歲。', '-TEEN 重音在後面、尾音長；-ty 重音在前面', 2],
    ['My aunt is fifteen.', 'My aunt is fifty.', '我阿姨十五歲。', '我阿姨五十歲。', 'fifTEEN／FIFty', 2],
    ['Nice to meet you.', 'Nice to see you.', '很高興認識你。', '很高興見到你。', 'meet（第一次見面）／see（再見面）', 1],
    ['How are you?', 'How old are you?', '你好嗎？', '你幾歲？', '多了 old：問年紀', 1],
    ['Open your book.', 'Close your book.', '打開課本。', '闔上課本。', 'open／close', 1],
  ],
  'Unit 1': [
    ['He is tall.', 'She is tall.', '他很高。', '她很高。', 'he／she：聽開頭的 h 和 sh', 1],
    ['Is he your cousin?', 'Is she your cousin?', '他是你的表哥嗎？', '她是你的表姊嗎？', 'he／she：Is he 的 h 很輕，要聽有沒有 sh', 2],
    ['My aunt is forty.', 'My aunt is fourteen.', '我阿姨四十歲。', '我阿姨十四歲。', 'FORty／fourTEEN', 2],
    ['This is my mother.', 'This is my brother.', '這是我媽媽。', '這是我哥哥。', 'mother／brother：聽開頭的 m 和 b', 1],
    ['Her name is Amy.', 'His name is Andy.', '她的名字是 Amy。', '他的名字是 Andy。', 'her／his', 2],
    ["He's my uncle.", "He's my cousin.", '他是我叔叔。', '他是我表哥。', 'uncle／cousin', 1],
  ],
  'Unit 2': [
    ['This is my pencil.', 'These are my pencils.', '這是我的鉛筆。', '這些是我的鉛筆。', 'this is／these are；pencil 有沒有 s', 2],
    ['That is a box.', 'Those are boxes.', '那是一個箱子。', '那些是箱子。', 'that／those；boxes 結尾 /ɪz/', 2],
    ["It's in my bag.", "It's on my back.", '它在我的袋子裡。', '它在我的背上。', 'bag 母音拉長、back 短促收尾；in／on 也不同', 3],
    ['The cat is on the box.', 'The cat is under the box.', '貓在箱子上面。', '貓在箱子下面。', 'on／under', 1],
    ['Open the box.', 'Open the boxes.', '打開箱子。', '打開那些箱子。', '複數字尾 -es 念 /ɪz/', 2],
    ['Where is my watch?', 'Where are my watches?', '我的手錶在哪裡？', '我的那些手錶在哪裡？', 'is／are 配單複數', 2],
  ],
  'Unit 3': [
    ['I can swim.', "I can't swim.", '我會游泳。', '我不會游泳。', "can 輕、can't 重；t 常聽不到，聽重音", 2],
    ["Let's go.", "Let's not go.", '我們走吧。', '我們別去吧。', "多一個 not", 1],
    ['Be quiet.', 'Be quick.', '安靜。', '快一點。', 'quiet 兩個音節、quick 一個', 2],
    ['Turn on the light.', 'Turn off the light.', '開燈。', '關燈。', 'on／off', 1],
    ['Give it to him.', 'Give it to them.', '把它給他。', '把它給他們。', 'him／them：him 的 h 很輕，聽 them 開頭的 th', 2],
    ['She can cook.', "She can't cook.", '她會煮飯。', '她不會煮飯。', "can 輕讀 /kən/、can't 重讀 /kænt/", 2],
  ],
  'Unit 4': [
    ["It's seven fifteen.", "It's seven fifty.", '七點十五分。', '七點五十分。', 'fifTEEN／FIFty', 2],
    ["It's on Tuesday.", "It's on Thursday.", '在星期二。', '在星期四。', 'Tuesday 開頭 t、Thursday 開頭 th', 2],
    ['The movie is at two thirty.', 'The movie is at two thirteen.', '電影在兩點半。', '電影在兩點十三分。', 'THIRty／thirTEEN', 3],
    ["She's reading.", "She's eating.", '她在看書。', '她在吃東西。', 'reading／eating：聽開頭的 r', 1],
    ["They're walking.", "They're working.", '他們在走路。', '他們在工作。', 'walk 念 /wɔk/（l 不發音）／work 念 /wɝk/ 要捲舌', 3],
    ["It's a quarter past nine.", "It's a quarter to nine.", '九點十五分。', '八點四十五分。', 'past ＝ 過了、to ＝ 差', 3],
  ],
  'Unit 5': [
    ['My birthday is in June.', 'My birthday is in July.', '我的生日在六月。', '我的生日在七月。', 'June 一個音節、July 兩個（重音在後）', 2],
    ["It's May first.", "It's May fourth.", '五月一日。', '五月四日。', 'first 念 /fɝst/，結尾 st；fourth 念 /fɔrθ/，結尾咬舌', 2],
    ["It's October thirteenth.", "It's October thirtieth.", '十月十三日。', '十月三十日。', 'thirTEENTH／THIRtieth', 3],
    ["It's the fifth.", "It's the fifteenth.", '五號。', '十五號。', 'fifth／fifTEENTH', 3],
    ["It's on the second Sunday.", "It's on the second Saturday.", '在第二個星期日。', '在第二個星期六。', 'Sunday／Saturday', 2],
    ['Christmas is in December.', "Teachers' Day is in September.", '聖誕節在十二月。', '教師節在九月。', '-cember／-tember', 2],
  ],
  'Unit 6': [
    ['There is a cat.', 'There are cats.', '有一隻貓。', '有一些貓。', 'is＋單數／are＋複數', 1],
    ['Is there a lion?', 'Are there any lions?', '有一隻獅子嗎？', '有獅子嗎？', 'Is there a／Are there any', 2],
    ["There's a bear.", "There's a bird.", '有一隻熊。', '有一隻鳥。', 'bear 的 ear 念 /ɛr/（同 air）／bird 的 ir 念 /ɝ/', 2],
    ['I can see a sheep.', 'I can see a ship.', '我看到一隻羊。', '我看到一艘船。', 'sheep 的 ee 長、ship 的 i 短', 3],
    ['There is a snake.', 'There is a snack.', '有一條蛇。', '有一份點心。', 'snake 的 a 念 /eɪ/、snack 念 /æ/', 3],
    ['There are some monkeys.', 'There are three monkeys.', '有一些猴子。', '有三隻猴子。', 'some／three', 1],
  ],
}

// 問答：App 問，學生自己用英文回答（不看答案）。[問句, [可以接受的答案…], 問句中文, 提醒, lv]
// 問答：App 問，學生自己用英文回答（不看答案）。[問句, [可以接受的答案…], 問句中文, 提醒, lv, { fig, hint }]
// 答案不只一種：念到任何一個就算；人名不算分。fig＝圖（people／pic／clock），hint＝情境提示；第一個答案要和圖一致
export const SPEAK_QA = {
  Starter: [
    ["What's your name?", ['My name is Amy.', "I'm Amy.", 'I am Amy.'], '你叫什麼名字？', '回答 My name is… 或 I\'m…', 1, { hint: '說你自己的名字' }],
    ['How are you?', ["I'm fine, thank you.", 'I am fine, thank you.', "I'm good.", "I'm great."], '你好嗎？', '', 1, { fig: { k: 'people', list: [['', '😊', '']] } }],
    ['How old are you?', ["I'm thirteen.", 'I am thirteen years old.', "I'm thirteen years old.", "I'm twelve.", "I'm fourteen."], '你幾歲？', '回答年紀：I\'m ＋ 數字', 1, { hint: '你 13 歲' }],
    ['Nice to meet you.', ['Nice to meet you, too.'], '很高興認識你。', '回「我也是」要加 too', 1, { fig: { k: 'people', list: [['', '🤝', '']] } }],
    ['Good morning, Amy.', ['Good morning, Mr. Lee.', 'Good morning.'], '早安，Amy。', '', 1, { hint: '對方是李老師（Mr. Lee）' }],
    ['Are you a student?', ['Yes, I am.', 'No, I am not.', "No, I'm not."], '你是學生嗎？', '問 you，回答用 I', 2, { fig: { k: 'people', list: [['you', '🧑‍🎓', '']] } }],
  ],
  'Unit 1': [
    ["Who's that boy?", ["He's my brother.", 'He is my brother.', "He's my cousin.", "He's my friend.", 'He is my cousin.'], '那個男孩是誰？', '回答 He\'s my…', 1, { fig: { k: 'people', list: [['my brother', '👦', '']] } }],
    ['Is she your sister?', ['Yes, she is.', "No, she isn't.", 'No, she is not.'], '她是你姊姊嗎？', '簡答：Yes, she is.／No, she isn\'t.', 2, { fig: { k: 'people', list: [['my sister', '👧', '✔']] } }],
    ['Is your father a doctor?', ["No, he isn't. He's a cook.", "No, he isn't.", 'Yes, he is.', "No, he isn't. He is a teacher."], '你爸爸是醫生嗎？', '問 your father，回答用 he', 2, { fig: { k: 'people', list: [['Dad', '👨', '🍳']] } }],
    ['How old is your grandma?', ["She's seventy.", 'She is seventy years old.', "She's seventy years old.", "She's sixty.", 'She is sixty-eight.'], '你奶奶幾歲？', '回答 She\'s ＋ 數字', 2, { fig: { k: 'people', list: [['Grandma・70', '👵', '']] } }],
    ['Are they your parents?', ['Yes, they are.', "No, they aren't.", 'No, they are not.'], '他們是你的父母嗎？', '簡答用 they', 2, { fig: { k: 'people', list: [['Mom & Dad', '👩👨', '✔']] } }],
    ['Who are they?', ["They're my uncle and aunt.", 'They are my grandparents.', "They're my parents.", 'They are my friends.'], '他們是誰？', 'They\'re my…', 2, { fig: { k: 'people', list: [['uncle & aunt', '👨👩', '']] } }],
    ["What's your mother's job?", ["She's a nurse.", 'She is a teacher.', "She's an English teacher.", 'She is a cook.', "She's a doctor."], '你媽媽的工作是什麼？', '職業前面要有 a／an', 3, { fig: { k: 'people', list: [['Mom', '👩', '💉']] } }],
  ],
  'Unit 2': [
    ['Where is my eraser?', ["It's under the desk.", "It's in the box.", "It's on the table.", 'It is under your book.', "It's in your bag."], '我的橡皮擦在哪裡？', '回答位置：It\'s ＋ 介系詞 ＋ 地方', 2, { hint: '橡皮擦在書桌下面（under the desk）' }],
    ["What's this?", ["It's a pen.", "It's a marker.", "It's an eraser.", 'It is a pen.', "It's a notebook."], '這是什麼？', 'It\'s a／an…', 1, { fig: { k: 'pic', rows: ['🖊️'], bg: 'plain' } }],
    ['Are these your notebooks?', ['Yes, they are.', "No, they aren't.", 'No, they are not.'], '這些是你的筆記本嗎？', 'these → they', 2, { fig: { k: 'pic', rows: ['📒📒 ✔'], bg: 'plain' }, hint: '是你的' }],
    ['What are those?', ['They are books.', "They're books.", 'They are my books.', "They're comic books.", 'They are pencils.'], '那些是什麼？', 'those → They\'re ＋ 複數', 2, { fig: { k: 'pic', rows: ['📚📚📚'], bg: 'room' } }],
    ['Is that your bag?', ["No, it isn't. It's Amy's.", "No, it isn't.", 'Yes, it is.'], '那是你的袋子嗎？', 'that → it', 1, { fig: { k: 'pic', rows: ['🎒 Amy'], bg: 'plain' }, hint: '不是你的，是 Amy 的' }],
    ['Where are the cats?', ["They're behind the sofa.", 'They are under the bed.', "They're on the sofa.", 'They are in the box.'], '貓在哪裡？', '複數 → They\'re', 2, { fig: { k: 'pic', rows: ['🐱🐱', '🛋️'], bg: 'room' }, hint: '貓在沙發後面（behind）' }],
    ['Is your pencil box blue?', ["No, it isn't. It's red.", "No, it isn't.", 'Yes, it is.'], '你的鉛筆盒是藍色的嗎？', '', 2, { fig: { k: 'pic', rows: ['🟥 ✏️'], bg: 'plain' }, hint: '鉛筆盒是紅色的' }],
  ],
  'Unit 3': [
    ['Can you swim?', ['Yes, I can.', "No, I can't.", 'No, I cannot.'], '你會游泳嗎？', '問 you → 答 I', 1, { fig: { k: 'people', list: [['you', '🧑', '🏊 ✔']] } }],
    ['Can I use your phone?', ['Sure.', 'Yes, you can.', "Sorry, you can't.", 'OK.', 'Sure, here you are.'], '我可以用你的手機嗎？', '問 Can I → 答 you can', 2, { hint: '你願意借' }],
    ["Let's go to the park.", ['OK.', 'Good idea.', 'OK, good idea.', "Sorry, I can't.", 'Great idea.'], '我們去公園吧。', '答應或拒絕', 1, { fig: { k: 'pic', rows: ['🌳⛲🌳'], bg: 'grass' }, hint: '你想去' }],
    ['What can Ben do?', ['He can ride a bike.', 'He can swim.', 'He can cook.', 'He can sing.', 'He can play basketball.'], 'Ben 會做什麼？', 'He can ＋ 原形動詞', 2, { fig: { k: 'people', list: [['Ben', '👦', '🚲']] } }],
    ['Can he cook?', ["No, he can't.", 'Yes, he can.'], '他會煮飯嗎？', "can't 要重讀", 1, { fig: { k: 'people', list: [['Ben', '👦', '🍳 ✘']] } }],
    ['Who can help me?', ['I can help you.', 'I can.', 'Ben can.', 'Ben can help you.'], '誰可以幫我？', '', 3, { hint: '你可以幫忙' }],
    ["I can't open the door.", ['Let me help you.', 'I can help you.', "Don't worry. I can help you."], '我打不開門。', '回應：幫忙', 3, { fig: { k: 'pic', rows: ['🚪😣'], bg: 'room' } }],
  ],
  'Unit 4': [
    ['What time is it?', ["It's seven fifteen.", "It's nine o'clock.", "It's three thirty.", 'It is ten twenty.', "It's eight o'clock."], '現在幾點？', 'It\'s ＋ 時間（不用 at）', 1, { fig: { k: 'clock', h: 7, m: 15 } }],
    ['What day is today?', ["It's Friday.", 'Today is Friday.', "It's Monday.", "It's Tuesday.", "It's Wednesday.", "It's Thursday.", "It's Saturday.", "It's Sunday.", 'Today is Monday.', 'Today is Saturday.', 'Today is Sunday.', 'Today is Tuesday.', 'Today is Wednesday.', 'Today is Thursday.'], '今天星期幾？', 'It\'s ＋ 星期（第一個字母大寫的那些）', 1, { fig: { k: 'cal', mon: 'This Week', first: 0, days: 7, mark: [6] }, hint: '今天是星期五' }],
    ['What are you doing?', ["I'm reading.", 'I am reading a book.', "I'm doing my homework.", "I'm watching TV.", "I'm eating.", "I'm playing basketball.", "I'm listening to music."], '你在做什麼？', 'I\'m ＋ V-ing', 2, { fig: { k: 'people', list: [['you', '🧑', '📖']] } }],
    ['Is he sleeping?', ["No, he isn't. He's reading.", "No, he isn't.", 'Yes, he is.'], '他在睡覺嗎？', '', 2, { fig: { k: 'people', list: [['Ben', '👦', '📖']] } }],
    ['What time is the concert?', ["It's at seven thirty.", 'At seven thirty.', "It's at seven.", 'At eight.', "It's at eight o'clock."], '演唱會幾點？', '幾點前面用 at', 2, { fig: { k: 'pic', rows: ['🎤 7:30'], bg: 'plain' } }],
    ['Are you free this weekend?', ['Yes, I am.', "No, I'm not.", 'No, I am not.', "Sorry, I'm not."], '你這個週末有空嗎？', '', 2, { hint: '你有空' }],
    ['What is your sister doing now?', ['She is playing the piano.', "She's doing her homework.", 'She is sleeping.', "She's reading.", "She's watching TV."], '你姊姊現在在做什麼？', 'She\'s ＋ V-ing', 3, { fig: { k: 'people', list: [['my sister', '👧', '🎹']] } }],
  ],
  'Unit 5': [
    ['When is Christmas?', ["It's on December twenty-fifth.", 'It is on December twenty-fifth.', "It's in December."], '聖誕節是什麼時候？', 'on ＋ 月 日／in ＋ 月', 2, { fig: { k: 'pic', rows: ['🎄 12／25'], bg: 'plain' } }],
    ["When is New Year's Day?", ["It's on January first.", 'It is on January first.', "It's in January."], '元旦是什麼時候？', '', 2, { fig: { k: 'pic', rows: ['🎆 1／1'], bg: 'plain' } }],
    ["What month is Mother's Day in?", ["It's in May.", 'May.', 'It is in May.', "It's in May, on the second Sunday."], '母親節在幾月？', '月份前面用 in', 2, { fig: { k: 'cal', mon: 'May 2027', first: 6, days: 31, mark: [9], emo: { 9: '💐' } } }],
    ["Today is October tenth. What's the date tomorrow?", ["It's October eleventh.", 'It is October eleventh.', 'October eleventh.'], '今天十月十日，明天幾月幾日？', 'eleventh 的 th', 3, { fig: { k: 'cal', mon: 'October 2026', first: 4, days: 31, mark: [10, 11] } }],
    ["Today is May thirty-first. What's the date tomorrow?", ["It's June first.", 'It is June first.', 'June first.'], '今天五月三十一日，明天幾月幾日？', '五月只有 31 天 → 六月一日', 3, { hint: '五月的最後一天 → 明天是六月' }],
    ['Is your birthday in June?', ["No, it isn't. It's in July.", "No, it isn't.", 'Yes, it is.', "No, it isn't. It's in May."], '你的生日在六月嗎？', '', 2, { fig: { k: 'pic', rows: ['🎂 7／'], bg: 'plain' }, hint: '你的生日在七月' }],
    ["When is Teachers' Day in Taiwan?", ["It's on September twenty-eighth.", 'It is on September twenty-eighth.', 'September twenty-eighth.'], '台灣的教師節是什麼時候？', 'twenty-eighth', 3, { fig: { k: 'pic', rows: ['🧑‍🏫 9／28'], bg: 'plain' } }],
  ],
  'Unit 6': [
    ['Is there a tiger in the zoo?', ['Yes, there is.', "No, there isn't.", 'No, there is not.'], '動物園裡有老虎嗎？', 'Is there → there is／isn\'t', 1, { fig: { k: 'pic', rows: ['🐯'], bg: 'grass' } }],
    ['Are there any elephants?', ['Yes, there are two.', 'Yes, there are.', "No, there aren't.", 'No, there are not.'], '有大象嗎？', 'Are there → there are／aren\'t', 1, { fig: { k: 'pic', rows: ['🐘🐘'], bg: 'grass' } }],
    ['There are three monkeys and one lion. How many monkeys are there?', ['There are three.', 'Three.', 'There are three monkeys.'], '有三隻猴子和一隻獅子。猴子有幾隻？', '', 2, { fig: { k: 'pic', rows: ['🐒🐒🐒', '🦁'], bg: 'grass' } }],
    ['How many days are there in a week?', ['There are seven.', 'Seven.', 'There are seven days.', 'There are seven days in a week.'], '一個星期有幾天？', '', 2, { fig: { k: 'cal', mon: 'This Week', first: 0, days: 7 } }],
    ['Is there any milk in the fridge?', ['Yes, there is.', "No, there isn't.", 'No, there is not.'], '冰箱裡有牛奶嗎？', 'milk 不可數 → is', 2, { fig: { k: 'pic', rows: ['🥛'], bg: 'room' }, hint: '有' }],
    ["What's in the river?", ['There is a fish in the river.', 'There is a fish.', 'A fish.', 'There are some fish.', 'There are some fish in the river.'], '河裡有什麼？', 'There is／are…', 3, { fig: { k: 'pic', rows: ['🐟'], bg: 'water' } }],
    ['Are there any snakes in the Bug House?', ["No, there aren't.", "No, there aren't any snakes.", 'Yes, there are.'], '昆蟲館裡有蛇嗎？', '', 3, { fig: { k: 'pic', rows: ['🐛🐞🦋'], bg: 'grass' }, hint: '只有蟲，沒有蛇' }],
  ],
}
