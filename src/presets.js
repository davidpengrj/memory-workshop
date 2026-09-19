export const palettes = {
  tide: { name: '海盐与月光', colors: ['#173c3d','#25595a','#448a88','#7aafaa','#a9c8b7','#eadcae'], sky:'#fff0bc', bg:'#dce5dc' },
  dusk: { name: '日落来信', colors: ['#623b44','#935450','#bf7c64','#dbaa76','#e1c399','#f3dbaf'], sky:'#ffefab', bg:'#ede0d2' },
  forest: { name: '林间慢慢', colors: ['#2e4438','#49634d','#74856a','#a0a585','#c4c8a0','#eee1b7'], sky:'#fff0c6', bg:'#e1e5d6' },
  rose: { name: '玫瑰色的梦', colors: ['#533b51','#795671','#a47a94','#c8a0ab','#ddbfba','#f2dfce'], sky:'#fff1d5', bg:'#eadfe2' }
};
export const presets = [
 { id:'sea', tag:'一起看过的海', icon:'waves', story:'毕业前的那个晚上，我和最好的朋友在海边等日出。远处有灯塔，有一只小帆船。后来去了不同的城市，希望把那天的海风留在桌上。', plan:{title:'海风替我们记得',subtitle:'Where the sea keeps our stories',narrative:'灯塔是那晚不变的坐标。把海岸与帆船叠成远近，让并肩的两个人留在最靠近你的地方。',theme:'coast',palette:'tide',sky:'sun',motifs:['lighthouse','sailboat','couple'],seed:42,dedication:'山海有期，来日再见',decisions:['日出与灯塔呼应那个毕业清晨','海浪分成三层，留出真实的纵深','把并肩的两个人放在前景，成为回忆的主角']} },
 { id:'home', tag:'小猫等我回家', icon:'cat', story:'搬家之后，很想念外婆的小院。院里有一棵大树和几盆花，橘猫总蹲在门口等我。我想做一份温柔的小礼物送给外婆。', plan:{title:'院子里，永远有盏灯',subtitle:'Some places always feel like home',narrative:'把老房子藏在树荫里，让小猫坐在最前面。柔和的层次留住小院的安静，也留住有人等你回家的心情。',theme:'garden',palette:'forest',sky:'moon',motifs:['house','cat','trees','flowers'],seed:123,dedication:'回家的路，猫也记得',decisions:['老屋与树木构成小院的记忆锚点','前景小猫回应“等我回家”','以林绿与暖光表达陪伴']} },
 { id:'city', tag:'属于我们的城', icon:'arch', story:'我第一次来澳门上大学，和朋友走过大三巴、街边的小房子和海边的桥。想把这座城市装进一个小盒子，纪念新的开始。', plan:{title:'在这座城，遇见我们',subtitle:'A new chapter, a familiar light',narrative:'拱门让人想起初遇的街角，屋顶与桥梁依次退远。城市不只是一个地名，也是一段刚刚开始的故事。',theme:'city',palette:'dusk',sky:'stars',motifs:['arch','house','bridge','couple'],seed:789,dedication:'我们的故事，从这里亮起',decisions:['用拱门意象表达澳门的街巷记忆','桥与屋顶形成城市的前后层次','前景的两人把城市连接到个人经历']} }
];
export const layerNames=['取景框','回忆主角','近景片段','故事地标','远处风景','天空背板'];
export const motifLabels={lighthouse:'灯塔',sailboat:'帆船',couple:'两个人',cat:'小猫',dog:'小狗',house:'小屋',pagoda:'塔楼',arch:'拱门',trees:'树木',flowers:'花朵',mountain:'山峰',bridge:'桥梁'};
