var fs = require('fs-extra'),
	path = require('path'),
	marked = require('marked'),
	highlightJs = require('highlight.js'),
	xtpl = require('xtpl'),
	unescapeHtml = require('unescape-html'),
	util = require('./util.js')

//markdown定制
var markedRenderer = new marked.Renderer();

var srcDirPath = '',
	projectPath = '',
	homePageOnlineUrl = '',
	version = '';

var headerListsHtml = '';
markedRenderer.heading = function(text, level){
	if(level == 2 || level == 3){
		headerListsHtml += '<li class="level' + level + '"><a href="#' + text + '">' + text + '</a></li>'; 
	}

	return '<h' + level + ' id="' + text + '">' + text + '</h' + level + '>';
};
markedRenderer.link = function(href, title, text){
	href = href.replace('{{{version}}}','/'+version);
	return '<a href="' + href + '">' + text + '</a>';
}

marked.setOptions({
  highlight: function (code) {
    return highlightJs.highlightAuto(code).value;
  },
  renderer : markedRenderer
});

module.exports.buildGuide = function(srcUrl,config){
	version = config.version;
	srcDirPath = path.resolve(srcUrl);
	projectPath = path.resolve(srcUrl, '../');

	var	guidesPath = path.resolve(srcDirPath, './guides'),
		guidesModuleLists = [];
	fs.readdirSync(guidesPath).forEach(function(dir){
		var dirName = path.resolve(guidesPath,dir),
			src = path.normalize('./'+ dir + '/index.html');
		guidesModuleLists.push({
			name : dir,
			src : src
		});
		if(fs.statSync(dirName).isDirectory()){
			var sideBarHtml = getSideBarHtmlSync(dirName);
			//将markdown转为html
			fs.readdirSync(dirName).forEach(function(file){
				if(file.indexOf('DS_Store') > -1){ return; };
				headerListsHtml = '';   //每编译一次markdown文件前都重置一下

				var fileName = path.resolve(dirName,file),
					fileMD = fs.readFileSync(fileName).toString(),
					fileHtml = marked(fileMD),
					title = getTitle(fileHtml),
					apiLinkReg = /\(\(\(apilink\s*(.+)\)\)\)/,
					apiLinkRegResult = apiLinkReg.exec(fileHtml),
					apilink = '../../api';
				sideBarHtml.headerListsHtml = headerListsHtml;  //调用marked()后即生成
				if(apiLinkRegResult){
					apilink = apiLinkRegResult[1];
					var name = /&quot;(.+)&quot;/.exec(apilink)[1];
					apilink = apilink.indexOf('class') > -1 ? ('../../api/classes/' + name + '.html') : ('../../api/modules/' + name + '.html');
					fileHtml = fileHtml.replace(apiLinkRegResult[0],'');
				}

				var newSideBarHtml = util.clone(sideBarHtml);  //拷贝对象，下面的模板渲染是异步的，引用类型sideBarHtml会被改变，需要拷贝
				var mainXtplPath = path.resolve(srcDirPath,'../themes/guides/layouts/main.xtpl'),
					desFile = xtpl.__express(mainXtplPath,{
						mainContent : fileHtml,
						sidebarContent : newSideBarHtml,
						apilink : apilink,
						version : version,
						title : title,
						settings : {
							'view encoding' : 'utf-8'
						}
					},function(err,desFile){
						if(err){
							console.log('render error!');
						}else{
							var desFileName = path.normalize(fileName.replace('src','5.0').replace('.md','.html'));
							!fs.existsSync(path.dirname(desFileName)) && fs.mkdirsSync(path.dirname(desFileName));
							fs.writeFileSync(desFileName, desFile);
						}
					});
			});
		}
	});
	buildGuideIndex(guidesModuleLists);
};


module.exports.buildDemos = function(srcUrl,config){
	version = config.version;
	homePageOnlineUrl = config.homePageOnlineUrl;
	srcDirPath = path.resolve(srcUrl);
	projectPath = path.resolve(srcUrl, '../');

	var	demosPath = path.resolve(srcDirPath, './demos'),
		demoLists = [];
	fs.readdirSync(demosPath).forEach(function(dir){
		var dirName = path.resolve(demosPath,dir),
			src = path.normalize('./' + dir + '/index.html');
		if(dirName.indexOf('DS_Store') > -1){ return; };
		demoLists.push({
			name : dir,
			src : src
		});
		if(fs.statSync(dirName).isDirectory()){
			var sideBarHtml = getSideBarHtmlSync(dirName);

			fs.readdirSync(dirName).forEach(function(file){
				if(file.indexOf('DS_Store') > -1){ return; };
				var fileName = path.resolve(dirName,file),
					mainXtplPath = path.resolve(srcDirPath,'../themes/demos/layouts/main.xtpl'),
					demoCodeXtplPath = path.resolve(srcDirPath,'../themes/demos/layouts/demo-code.xtpl');
				if(fs.statSync(fileName).isDirectory()){
					var citedByMdPath = fileName,
						desCitedByMdPath = citedByMdPath.replace('src','5.0');
					util.exists(citedByMdPath, desCitedByMdPath, util.copy);  //将cited-by-md文件夹搬过去

					var assetsPath = path.resolve(fileName+'/assets'),   //将assets文件夹放到相应的demo模块目录
						desAssetsPath = assetsPath.replace('src','5.0').replace('cited-by-md','');
					fs.existsSync(assetsPath) && util.exists(assetsPath, desAssetsPath, util.copy);
					return;
				}

				var fileMD = fs.readFileSync(fileName).toString(),
					fileHtml = unescapeHtml(marked(fileMD)),
					title = getTitle(fileHtml),
					apiLinkReg = /\(\(\(apilink\s*(.+)\)\)\)/,
					apiLinkRegResult = apiLinkReg.exec(fileHtml),
					apilink = '../../api',
					fileReg = /\[\[\[(.+?)\]\]\]/g,
					includingFiles = fileHtml.match(fileReg);
				if(apiLinkRegResult){
					apilink = apiLinkRegResult[1];
					var name = /['"](.+)['"]/.exec(apilink)[1];
					apilink = apilink.indexOf('class') > -1 ? ('../../api/classes/' + name + '.html') : ('../../api/modules/' + name + '.html');
					fileHtml = fileHtml.replace(apiLinkRegResult[0],'');
				}
				var compiledDemosNum = 0,
					tagMapDemoHtml = [];
				for(var i = 0; i < includingFiles.length; i++){
					var str = unescapeHtml(includingFiles[i]),
						whichFileToInclude = /include\s*file=['"](.+?)['"]/.exec(str)[1],
						heightRegResult = /height=['"](.+?)['"]/.exec(str),
						height = heightRegResult ? heightRegResult[1] : '800px',
						includingFilePath = path.resolve(dirName,whichFileToInclude),
						qrcodeAddr = homePageOnlineUrl + version + '/' + path.relative(srcDirPath,includingFilePath);
					var demoCode = fs.readFileSync(includingFilePath).toString();
					(function(str, demoCodeXtplPath, demoCode){
						xtpl.__express(demoCodeXtplPath,{
							demoCode : demoCode,
							QRCodeAddr : qrcodeAddr,
							height : height,
							version : version,
							settings : {
								'view encoding' : 'utf-8'
							}
						},function(err,demoCodeHtml){
							if(err){
								console.log('error occur:' + str);
							}else{
								compiledDemosNum++;
								tagMapDemoHtml.push({
									str : str,
									demoCodeHtml : demoCodeHtml
								});
								if(compiledDemosNum === includingFiles.length){
									for(var j = 0; j < tagMapDemoHtml.length; j++){
										var obj = tagMapDemoHtml[j];
										fileHtml = fileHtml.replace(obj.str,obj.demoCodeHtml);
									}
									xtpl.__express(mainXtplPath,{
										mainContent : fileHtml,
										sidebarContent : sideBarHtml,
										apilink : apilink,
										version : version,
										title : title,
										settings : {
											'view encoding' : 'utf-8'
										}
									},function(err,desFile){
										var desFileName = path.normalize(fileName.replace('src','5.0').replace('.md','.html'));
										!fs.existsSync(path.dirname(desFileName)) && fs.mkdirsSync(path.dirname(desFileName));
										fs.writeFileSync(desFileName, desFile);
									});
								}
							}
						});
					})(str, demoCodeXtplPath, demoCode);
				}
			});
		}
		buildDemoIndex(demoLists);
	});
};

module.exports.aggregateApiSource = function(bowerComponentsDir, buildPath, callback){
	if(!fs.existsSync(bowerComponentsDir)){
		console.log(bowerComponentsDir + ' not exists');
		return;
	}
	fs.readdirSync(bowerComponentsDir).forEach(function(modName){
		var docsPathInMod = path.join(bowerComponentsDir, modName, 'docs');
		if(!fs.existsSync(docsPathInMod)){
			return false;
		}
		fs.removeSync(buildPath);
		fs.copySync(path.normalize(docsPathInMod), buildPath);
	});
	callback();  //回调，通知gulp下一个任务(buildapi)可以开始执行了 。
}

module.exports.buildOthers = function(srcUrl,config){
	version = config.version;
	srcDirPath = path.resolve(srcUrl);
	projectPath = path.resolve(srcUrl, '../');
	var mainXtplPath = path.resolve(srcDirPath,'../themes/layouts/main.xtpl');

	fs.readdirSync(srcDirPath).forEach(function(file){
		if(file === 'api' || file === 'demos' || file === 'guides' || file === 'assets' || file === '.DS_Store'){
			return;  //这个三个目录在其他地方处理，如buildGuides/buildDemos等
		}
		var fileName = path.resolve(srcDirPath,file);
		if(!fs.statSync(fileName).isDirectory()){
			var mdContent = fs.readFileSync(fileName).toString(),
				desPath = path.normalize(fileName.replace('src','5.0').replace('.md','.html')),
				fileHtml = marked(mdContent),
				title = getTitle(fileHtml);
			var page = fileName.indexOf('index.md') > -1 ? "index" : "quickstart";
			xtpl.__express(mainXtplPath,{
				page : page,
				mainContent : fileHtml,
				version : version,
				title : title,
				settings : {
					'view encoding' : 'utf-8'
				}
			},function(err,desFile){
				fs.writeFileSync(desPath,desFile);
			});
		}else{
			var desDirName = path.normalize(fileName.replace('src','5.0'));
			!fs.existsSync(desDirName) && fs.mkdirsSync(desDirName);
			fs.readdirSync(fileName).forEach(function(file){
				var srcFileName = path.resolve(fileName,file);
				var mdContent = fs.readFileSync(srcFileName).toString(),
					desPath = path.normalize(srcFileName.replace('src','5.0').replace('.md','.html')),
					fileHtml = marked(mdContent),
					title = getTitle(fileHtml);
				xtpl.__express(mainXtplPath,{
					page : 'faq',
					mainContent : fileHtml,
					version : version,
					title : title,
					settings : {
						'view encoding' : 'utf-8'
					}
				},function(err,desFile){
					fs.writeFileSync(desPath,desFile);
				});
			});
		}
	});
};

function getTitle(htmlContent){
	var reg = /<h1.*>(.+)<\/h1>/,
		title = 'KISSY',
		result = reg.exec(htmlContent);
	if(result){
		title = result[1];
	}
	return title;
}

function trunMdIntoHtml(mdContent,desPath){
	!fs.existsSync(desPath) && fs.mkdirsSync(desPath);
	fs.writeFileSync(desFileName, desFile);
}

function getSideBarHtmlSync(dirUrl){
	var featureContent = getSideBarFeatures(dirUrl),
		demosContent = getSideBarDemos(dirUrl.replace('guides', 'demos'));
	return {
		featureContent : featureContent,
		demosContent : demosContent
	};
}

function getFeatures(dirUrl){
	var featureContent = '';
	if(fs.existsSync(dirUrl)){
		fs.readdirSync(dirUrl).forEach(function(file){
			if(file.indexOf('DS_Store') > -1){ return; };
			var fileName = path.resolve(dirUrl,file);
			if(fs.statSync(fileName).isDirectory()){
				return;  //如果是文件夹，在这里暂时是cited-by-md文件夹，不处理
			}
			var fileContent = fs.readFileSync(fileName).toString(),
				// reg =  /^ *(#{1}) *([^\n]+?) *#* *(?:\n+|$)/,
				reg = /#(.*)/,
				feature = reg.exec(fileContent)[1].trim();
			var fileLink = path.normalize(path.relative(projectPath,fileName).replace('src','../../').replace('.md','.html'));
			feature = '<p><a href="' + fileLink +'">' + feature + '</a></p>';
			featureContent += feature;
		});
	}
	return featureContent;
}

function getSideBarFeatures(dirUrl){
	var filesPath = dirUrl.replace('demos','guides');
	return getFeatures(filesPath);
}
function getSideBarDemos(dirUrl){
	var filesPath = dirUrl.replace('guides','demos');
	return getFeatures(filesPath);
}

function buildGuideIndex(guidesModuleLists){
	var productGuideIndexPath = path.resolve(projectPath, './5.0/guides/index.html'),
		guidesIndexXtplPath = path.resolve(projectPath, './themes/guides/layouts/guides-index.xtpl');
	xtpl.__express(guidesIndexXtplPath,{
		version : version,
		settings : {
			'view encoding' : 'utf-8'
		},
		guidesModuleLists : guidesModuleLists
	},function(err,content){
		if(err){
			console.log('error occuring when render guides-index.xtpl');
		}else{
			fs.ensureDirSync(path.dirname(productGuideIndexPath));
			fs.writeFileSync(productGuideIndexPath,content);
		}
	});
}

function buildDemoIndex(demoLists){
	var productDemoIndexPath = path.resolve(projectPath, './5.0/demos/index.html'),
		demosIndexXtplPath = path.resolve(projectPath, './themes/demos/layouts/demos-index.xtpl');

	xtpl.__express(demosIndexXtplPath,{
		version : version,
		settings : {
			'view encoding' : 'utf-8'
		},
		demoLists : demoLists
	},function(err,content){
		if(err){
			console.log('error occuring when render demos-index.xtpl');
		}else{
			fs.writeFileSync(productDemoIndexPath,content);
		}
	});
}