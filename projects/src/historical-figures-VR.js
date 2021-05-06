// Importando módulos
import * as THREE from "../libs/three/three.module.js";
import { VRButton } from "../libs/three/jsm/jsm/webxr/VRButton.js";
import { XRControllerModelFactory } from "../libs/three/jsm/jsm/webxr/XRControllerModelFactory.js";

function main(language) {
	const scene = new THREE.Scene();
	const textureLoader = new THREE.TextureLoader();
	const renderer = new THREE.WebGLRenderer({
		antialias: true,
		alpha: true,
	});
	renderer.shadowMap.enabled = true;
	renderer.shadowMapSoft = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.setClearColor(new THREE.Color(0x000000));
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.shadowMap.enabled = true;
	document.getElementById("webgl-output").appendChild(renderer.domElement);
	
	//tell your instance of WebGLRenderer to enable XR rendering
	renderer.xr.enabled = true; 

	// FIX: TRANSPARENCY Problem
	//  https://stackoverflow.com/questions/15994944/transparent-objects-in-threejs
	// Em seguida, os objetos serão renderizados na ordem em que são adicionados à cena 
	renderer.sortObjects = false; 

	// VR camera variables
	let cameraVR, user, marker;
	let groupCenter;

	// Time controller
	let timeAfter = 0;
	let dt = 0;

	// Creating raycaster objects
	let raycaster = new THREE.Raycaster();
	let raycasterPictures = new THREE.Raycaster(); // To create a ghost image when the picture is moving from the wall

	// Animation pages
	let animationList = [];
	let speedAnimation = 1.8; // 1.5

	// Raycaster and mouse Controllers
	let objectRaycaster = [], objectRaycasterClonePictures = [];
	let objectLooked = null, objectImagePlane = null, selectedImage = null;
	let pointCollisionRayCaster;

	// Translation attributes
	let texts, nameFiles;
	switch(language){
		case "en-US":            
			texts = {
				menu: ["MAIN MENU", "FAILS: ", "HITS: ", "TIMER: "],
			};
			nameFiles = {
				retry: "retry.png", messageVictory: "messageVictory.png",
				previous: "previous-2.png", messageLoose: "messageLoose.png",
				next: "next-2.png", changeCameraTitle: "changeCameraTitle.png"
			};
			break;
		case "pt-BR":            
			texts = {
				menu: ["MENU PRINCIPAL", "FALHAS: ", "ACERTOS: ", "TEMPO: "],
			};
			nameFiles = {
				retry: `retry-(${language}).png`, messageVictory: `messageVictory-(${language}).png`, messageLoose: `messageLoose-(${language}).png`,
				previous: `previous-(${language}).png`, next: `next-(${language}).png`,
				changeCameraTitle: `changeCameraTitle-(${language}).png`
			};
			break;
	}

	// Controls of sidebar
	const controls = {
		book: new THREE.Group(),
		// Game Attributes
		fails: 0,
		hits: 0,
		/**************************
		 *          States        *
		 *  0 => Game Running     *
		 *  1 => Victory          *
		 *  2 => Loose            *
		 *                        *
		 **************************/
		state: 0,
		timer: {
			minutes: 0,
			seconds: 0,
			updateTime: function (dt) {
				this.seconds += dt;
				if (this.seconds > 59) {
					this.seconds = 0;
					this.minutes++;
				}
			},
		},
		menu: {
			object: null,
			canvas: null,
			ctx: null, // Context
			drawMenu: function () {
				this.ctx.lineWidth = 2;
				this.ctx.strokeStyle = "black";
				this.ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);
				this.ctx.font = "Bold 38px Arial";
				this.ctx.fillStyle = "rgb(255, 255, 0)";
				this.ctx.fillText(texts.menu[0], 340, 45);
				this.ctx.fillText(texts.menu[1] + controls.fails, 20, 100);
				this.ctx.fillText(texts.menu[2] + controls.hits, 240, 100);
				this.ctx.fillText(
					`${texts.menu[3]} ${controls.timer.minutes.toLocaleString(undefined, {minimumIntegerDigits: 2,})} :  ${controls.timer.seconds.toFixed(0).toLocaleString(undefined, { minimumIntegerDigits: 2 })}`,
					490,
					100
				);
				this.object.material.map.needsUpdate = true; //Update the canvas texture
			},
			clearMenu: function () {
				this.ctx.fillStyle = "rgba(10, 10, 10)";
				this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
				this.object.material.map.needsUpdate = true; //Update the canvas texture
			},
		},
		
		// Pictures and Painting Wall
		pictures: [],
		imageClone: null,
		orderPicturesBook: [],
		messageVictory: null,
		messageLoose: null,
		// bookAttributes
		angleBeginPage: 0,
		angleFinishPage: 180,
		angleRatePage: 1.8, 
		// page and sheet attributes
		widthPage: 12,
		lengthPage: 14,
		heightBook: 0.5,
		amountSheets: 0,
		currentSheet: 0,
		amountPages: 0,
		buttons: [], // Retry, previous, next
		sizeButton: 5,	//1,75

		// Camera
		cameraOption: 1,
		cameraQuantity: 3,
		defaultCamera: null,
		cameraPositionPanel: new THREE.Group(),

		// Functions
		animationBook: function () {
			for (let i = 0; i < animationList.length; i++) {
				if (animationList[i].sideOption == 1) {
					if ( animationList[i].animationAngle > animationList[i].angleFinish) {
						animationList[i].animationAngle = 0;
						animationList.splice(i, 1);
						continue;
					}
					animationList[i].animationAngle =
						animationList[i].animationAngle + speedAnimation;
					animationList[i].rotateZ(THREE.Math.degToRad(speedAnimation));
				} else {
					if ( animationList[i].animationAngle < -animationList[i].angleFinish) {
						animationList[i].animationAngle = 0;
						animationList.splice(i, 1);
						continue;
					}
					animationList[i].animationAngle = animationList[i].animationAngle - speedAnimation;
					animationList[i].rotateZ(THREE.Math.degToRad(-speedAnimation));
				}
			}
		},
		animationScenary: function () {
			this.menu.clearMenu();
			this.menu.drawMenu();
			this.animationBook();
		},
		createBook: function () {
			for (let index = 0; index < this.pictures.length; index++) {
				this.createPage(this.orderPicturesBook[index]);
			}
			scene.add(this.book);
		},
		createButtons: function () {
            let buttonRetryGeometry = new THREE.PlaneGeometry(4, 2, 0.1, 0.1);
            let buttonRetryMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load(`./assets/icons/${nameFiles.retry}`), side: THREE.DoubleSide});
            let buttonRetry = new THREE.Mesh(buttonRetryGeometry, buttonRetryMaterial);
            this.buttons.push(buttonRetry);
            this.buttons[0].position.set(11.6, 20.25, -11.9);
            this.buttons[0].objectType = 3;
            scene.add(this.buttons[0]); 
			let buttonCameraGeometry = new THREE.PlaneGeometry(this.sizeButton, this.sizeButton, 0.1, 0.1);
            let buttonCameraMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load(`./assets/icons/${nameFiles.previous}`), side: THREE.DoubleSide});
            let buttonCamera = new THREE.Mesh(buttonCameraGeometry, buttonCameraMaterial);
			buttonCamera.position.set(0, 2, 0.1);
            this.buttons.push(buttonCamera);
			this.cameraPositionPanel.add(buttonCamera);
            this.buttons[1].objectType = 4;
			buttonCameraGeometry = new THREE.PlaneGeometry(this.sizeButton, this.sizeButton, 0.1, 0.1);
            buttonCameraMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load(`./assets/icons/${nameFiles.next}`), side: THREE.DoubleSide});
            buttonCamera = new THREE.Mesh(buttonCameraGeometry, buttonCameraMaterial);
			buttonCamera.position.set(0, -5, 0.1);
            this.buttons.push(buttonCamera);
			this.cameraPositionPanel.add(buttonCamera);
            this.buttons[2].objectType = 5;
		},
		createCameraPositionPanel: function(){
			let panelGeometry = new THREE.PlaneGeometry(10, 21, 0.1, 0.1);
            let panelMaterial = new THREE.MeshBasicMaterial({
				color: 0x00000, side: THREE.DoubleSide
			});
            let panelMesh = new THREE.Mesh(panelGeometry, panelMaterial);
			this.cameraPositionPanel.add(panelMesh);
			this.cameraPositionPanel.position.set(18.0, 11.2, -7.95);
			scene.add(this.cameraPositionPanel);
			let titleGeometry = new THREE.PlaneGeometry(10, 5, 0.1, 0.1);
            let titleMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load(`./assets/textures/historical-figures/${nameFiles.changeCameraTitle}`), side: THREE.DoubleSide});
            let title = new THREE.Mesh(titleGeometry, titleMaterial);
			this.cameraPositionPanel.add(title);
			title.position.set(0, 8, 0.1);
		},
		createImageClone: function () {
			let panelGeometry = new THREE.PlaneGeometry(8, 4, 0.1, 0.1);
			let panelMaterial = new THREE.MeshStandardMaterial({
				color: "rgb(255,255,255)", side: THREE.DoubleSide,
			});
			this.imageClone = new THREE.Mesh(panelGeometry, panelMaterial);
			this.imageClone.position.set(-100, -100, -100);
			scene.add(this.imageClone);
		},
		createMenu: function () {
			// create a canvas element
			let canvas1 = document.createElement("canvas");
			let context1 = canvas1.getContext("2d");
			canvas1.width = 1024;
			canvas1.height = 128; // Set dimensions of the canvas texture to adjust aspect ratio

			// canvas contents will be used for a texture
			let texture1 = new THREE.Texture(canvas1);
			texture1.needsUpdate = true;

			let material1 = new THREE.MeshBasicMaterial({ map: texture1, side: THREE.DoubleSide});
			material1.transparent = true;
			let mesh1 = new THREE.Mesh(new THREE.PlaneGeometry(29.5, 3), material1);
			mesh1.position.set(0, 20.4, -12.1);
			this.menu.object = mesh1;
			this.menu.canvas = canvas1;
			this.menu.ctx = context1;
			scene.add(mesh1);
		},
		createMessages: function () {
			// Victory and Loose
			let messageVictoryGeometry = new THREE.PlaneGeometry(26, 8, 0.1, 0.1);
            let messageVictoryMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load(`./assets/textures/historical-figures/${nameFiles.messageVictory}`), side: THREE.DoubleSide});
            this.messageVictory = new THREE.Mesh(messageVictoryGeometry, messageVictoryMaterial);
            this.messageVictory.position.set(0, 9, -11.9);
            this.messageVictory.visible = false;
            scene.add(this.messageVictory); 
            let messageLooseGeometry = new THREE.PlaneGeometry(26, 8, 0.1, 0.1);
            let messageLooseMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load(`./assets/textures/historical-figures/${nameFiles.messageLoose}`), side: THREE.DoubleSide});
            this.messageLoose = new THREE.Mesh(messageLooseGeometry, messageLooseMaterial);
            this.messageLoose.position.set(0, 9, -11.9);
            this.messageLoose.visible = false;
            scene.add(this.messageLoose); 
		},
		createPage: function (indexPicture) {
			if (this.amountPages % 2 == 0) {
				// Pair pages on the book
				// Adjust of rotation of the sheets inside of book
				for (let i = 0; i < this.book.children.length; i++) {
					let sheetAux = this.book.children[i];
					sheetAux.angleBegin = sheetAux.angleBegin + this.angleRatePage;
					sheetAux.angleFinish = 180 - i * this.angleRatePage; //- sheetAux.angleBegin;     //this.angleBeginPage;
					sheetAux.rotateZ(THREE.Math.degToRad(this.angleRatePage)); // rotation default of page
				}

				let sheet = new THREE.Group(); // Support the elements -- Center of rotation page

				// Page Background
				let pageGeometry = new THREE.PlaneGeometry(
					this.widthPage,
					this.lengthPage,
					0.1,
					0.1
				);
				let pageMaterial = new THREE.MeshBasicMaterial({
					transparent: true, //opacity: 0.5,
					map: textureLoader.load("./assets/textures/page.png"),
					side: THREE.DoubleSide,
				});
				//pageMaterial.depthWrite = false; 

				let page = new THREE.Mesh(pageGeometry, pageMaterial);
				page.name = "page_" + this.amountPages;
				page.position.set(this.widthPage / 2, 0, 0);
				page.rotateX(THREE.Math.degToRad(-90));
				sheet.add(page);
				sheet.position.set(0, this.heightBook, 0);
				sheet.sideOption = 0; //0 => Right, 1 => Left
				page.sheet = sheet;
				page.objectType = 0; // Page type
				page.indexPicture = indexPicture;

				// Image plane
				let imageGeometry = new THREE.PlaneGeometry(9, 4.5, 0.1, 0.1);
				let imageMaterial = new THREE.MeshBasicMaterial({
					color: "rgb(255, 255, 255)",
					side: THREE.DoubleSide,
				});
				let imagePlane = new THREE.Mesh(imageGeometry, imageMaterial);
				imagePlane.position.set(0, this.lengthPage / 4.5, 0.01);
				imagePlane.objectType = 2;
				imagePlane.name = "imageBlock-Page_" + this.amountPages;
				page.add(imagePlane);
				imagePlane.indexPicture = indexPicture;

				// Informations block
				let informationGeometry = new THREE.PlaneGeometry( 9.6, 6.08, 0.1, 0.1 );
				let informationMaterial = new THREE.MeshBasicMaterial({
					transparent: true,
					side: THREE.DoubleSide,
					map: textureLoader.load(
						`./assets/textures/historical-figures/pictures/information/${language}/${indexPicture}.png`
					),
				});
				//informationMaterial.depthTest = false; 
				let informationPlane = new THREE.Mesh(informationGeometry, informationMaterial);
				informationPlane.name = "informationBlock-Page_" + this.amountPages;
				informationPlane.position.set(0, -this.lengthPage / 5, 0.025); //0.01
				page.add(informationPlane);
				this.amountSheets++;
				this.book.add(sheet); // Added sheet with page on the book
				sheet.angleBegin = this.angleBeginPage;
				sheet.angleFinish = this.angleFinishPage;
				sheet.animationAngle = 0;

				// Adjust finish angle
				for (let i = 0; i < this.book.children.length; i++) {
					let sheetAux = this.book.children[i];
					sheetAux.angleFinish =
						180 - i * this.angleRatePage - sheetAux.angleBegin; //this.angleBeginPage;
				}
			} else {
				let sheet = this.book.children[this.book.children.length - 1]; // Take a sheet to insert a page on the book
			
				// Page Background
				let pageGeometry = new THREE.PlaneGeometry(
					this.widthPage,
					this.lengthPage,
					0.1,
					0.1
				);
				let pageMaterial = new THREE.MeshBasicMaterial({
					transparent: true, //opacity: 0.5,
					map: textureLoader.load("./assets/textures/page.png"),
					side: THREE.DoubleSide, //side:THREE.DoubleSide,
				});
				//pageMaterial.depthWrite = false; 
				let page = new THREE.Mesh(pageGeometry, pageMaterial);
				page.name = "page_" + this.amountPages;
				page.position.set(this.widthPage / 2, -0.005, 0);
				page.rotateX(THREE.Math.degToRad(-90));
				sheet.add(page);
				sheet.position.set(0, this.heightBook, 0);
				sheet.sideOption = 0; // 0 => Right, 1 => Left
				page.sheet = sheet;
				page.objectType = 0; // Page type
				page.indexPicture = indexPicture;

				// Image plane
				let imageGeometry = new THREE.PlaneGeometry(
					this.widthPage / 1.5,
					this.lengthPage / 3,
					0.1,
					0.1
				);
				let imageMaterial = new THREE.MeshBasicMaterial({
					color: "rgb(255, 255, 255)",
					side: THREE.DoubleSide,
				});
				let imagePlane = new THREE.Mesh(imageGeometry, imageMaterial);
				imagePlane.position.set(0, this.lengthPage / 4.5, -0.01);
				imagePlane.rotateY(THREE.Math.degToRad(180));
				imagePlane.objectType = 2;
				imagePlane.indexPicture = indexPicture;
				imagePlane.name = "imageBlock-Page_" + this.amountPages;
				page.add(imagePlane);

				// Informations block
				let informationGeometry = new THREE.PlaneGeometry(
					9.6,
					6.08,
					0.1,
					0.1
				);
				let informationMaterial = new THREE.MeshBasicMaterial({
					transparent: true /*opacity: 0.9,*/,
					side: THREE.DoubleSide,
					map: textureLoader.load(
						`./assets/textures/historical-figures/pictures/information/${language}/${indexPicture}.png`
					),
				});
				let informationPlane = new THREE.Mesh(
					informationGeometry,
					informationMaterial
				);
				informationPlane.name = "informationBlock-Page_" + this.amountPages;
				informationPlane.position.set(0, -this.lengthPage / 5, -0.025); // -0.01
				informationPlane.rotateY(THREE.Math.degToRad(180));
				page.add(informationPlane);
				//this.book.add(sheet);       // Added sheet with page on the book
			}
			this.amountPages++;
		},
		createPicturesPanel: function (scene) {
			let painelGeometry = new THREE.BoxGeometry(30, 19.5, 5);
			let painelMaterial = new THREE.MeshStandardMaterial({
				transparent: true,
				opacity: 0.5,
				map: textureLoader.load("./assets/textures/wood-2.jpg"),
				side: THREE.DoubleSide,
			});
			let panelPlane = new THREE.Mesh(painelGeometry, painelMaterial);
			panelPlane.position.set(0, 9.75, -15.1);
			scene.add(panelPlane);
			let skyboxGeometry = new THREE.SphereGeometry(200, 128, 128);
			let skyboxMaterial = new THREE.MeshBasicMaterial({
				map: textureLoader.load("./assets/textures/amir-timur-museum.jpeg"),
				side: THREE.DoubleSide,
			});
			let skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
			skybox.rotateY(60);
			skybox.position.set(0, 0, 50);
			scene.add(skybox);

			/** Pictures */

			let pictureGeometry = new THREE.PlaneGeometry(8, 4, 0.1, 0.1);
            let pictureMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/1.jpg"), side: THREE.DoubleSide});
            let picture = new THREE.Mesh(pictureGeometry, pictureMaterial);
            picture.position.set(-10, 4.5, -12);
            picture.objectType = 1;          //Image type
            picture.indexPicture = 1;
            picture.name = "picture_01";
            scene.add(picture);
            this.pictures.push(picture);
            this.orderPicturesBook.push(picture.indexPicture);
            let nameBoxGeometry = new THREE.PlaneGeometry(8, 1, 0.1, 0.1);
            let nameBoxMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/name/1.png"), side: THREE.DoubleSide});
            let nameBox = new THREE.Mesh(nameBoxGeometry, nameBoxMaterial);
            nameBox.position.set(-10, 1.5, -12);
            scene.add(nameBox);
            pictureGeometry = new THREE.PlaneGeometry(8, 4, 0.1, 0.1);
            pictureMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/2.jpg"), side: THREE.DoubleSide});
            picture = new THREE.Mesh(pictureGeometry, pictureMaterial);
            picture.name = "picture_02";
            picture.position.set(0, 4.5, -12);
            picture.objectType = 1;          //Image type
            picture.indexPicture = 2;
            scene.add(picture);
            this.pictures.push(picture);
            this.orderPicturesBook.push(picture.indexPicture);
            nameBoxGeometry = new THREE.PlaneGeometry(8, 1, 0.1, 0.1);
            nameBoxMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/name/2.png"), side: THREE.DoubleSide});
            nameBox = new THREE.Mesh(nameBoxGeometry, nameBoxMaterial);
            nameBox.position.set(0, 1.5, -12);
            scene.add(nameBox);
            pictureGeometry = new THREE.PlaneGeometry(8, 4, 0.1, 0.1);
            pictureMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/3.jpg"), side: THREE.DoubleSide});
            picture = new THREE.Mesh(pictureGeometry, pictureMaterial);
            picture.position.set(10, 4.5, -12);
            picture.objectType = 1;          //Image type
            picture.indexPicture = 3;
            picture.name = "picture_03";
            scene.add(picture);
            this.pictures.push(picture);
            this.orderPicturesBook.push(picture.indexPicture);
            nameBoxGeometry = new THREE.PlaneGeometry(8, 1, 0.1, 0.1);
            nameBoxMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/name/3.png"), side: THREE.DoubleSide});
            nameBox = new THREE.Mesh(nameBoxGeometry, nameBoxMaterial);
            nameBox.position.set(10, 1.5, -12);
            scene.add(nameBox);
            pictureGeometry = new THREE.PlaneGeometry(8, 4, 0.1, 0.1);
            pictureMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/4.jpg"), side: THREE.DoubleSide});
            picture = new THREE.Mesh(pictureGeometry, pictureMaterial);
            picture.position.set(-10, 10.5, -12);
            picture.objectType = 1;          //Image type
            picture.indexPicture = 4;
            picture.name = "picture_04";
            scene.add(picture);
            this.pictures.push(picture);
            this.orderPicturesBook.push(picture.indexPicture);
            nameBoxGeometry = new THREE.PlaneGeometry(8, 1, 0.1, 0.1);
            nameBoxMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/name/4.png"), side: THREE.DoubleSide});
            nameBox = new THREE.Mesh(nameBoxGeometry, nameBoxMaterial);
            nameBox.position.set(-10, 7.5, -12);
            scene.add(nameBox);
            pictureGeometry = new THREE.PlaneGeometry(8, 4, 0.1, 0.1);
            pictureMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/5.jpg"), side: THREE.DoubleSide});
            picture = new THREE.Mesh(pictureGeometry, pictureMaterial);
            picture.name = "picture_05";
            picture.position.set(0, 10.5, -12);
            picture.objectType = 1;          //Image type
            picture.indexPicture = 5;
            scene.add(picture);
            this.pictures.push(picture);
            this.orderPicturesBook.push(picture.indexPicture);
            nameBoxGeometry = new THREE.PlaneGeometry(8, 1, 0.1, 0.1);
            nameBoxMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/name/5.png"), side: THREE.DoubleSide});
            nameBox = new THREE.Mesh(nameBoxGeometry, nameBoxMaterial);
            nameBox.position.set(0, 7.5, -12);
            scene.add(nameBox);
            pictureGeometry = new THREE.PlaneGeometry(8, 4, 0.1, 0.1);
            pictureMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/6.jpg"), side: THREE.DoubleSide});
            picture = new THREE.Mesh(pictureGeometry, pictureMaterial);
            picture.position.set(10, 10.5, -12);
            picture.objectType = 1;          //Image type
            picture.indexPicture = 6;
            picture.name = "picture_06";
            scene.add(picture);
            this.pictures.push(picture);
            this.orderPicturesBook.push(picture.indexPicture);
            nameBoxGeometry = new THREE.PlaneGeometry(8, 1, 0.1, 0.1);
            nameBoxMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/name/6.png"), side: THREE.DoubleSide});
            nameBox = new THREE.Mesh(nameBoxGeometry, nameBoxMaterial);
            nameBox.position.set(10, 7.5, -12);
            scene.add(nameBox);
            pictureGeometry = new THREE.PlaneGeometry(8, 4, 0.1, 0.1);
            pictureMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/7.jpg"), side: THREE.DoubleSide});
            picture = new THREE.Mesh(pictureGeometry, pictureMaterial);
            picture.position.set(-10, 16.5, -12);
            picture.objectType = 1;          //Image type
            picture.indexPicture = 7;
            picture.name = "picture_07";
            scene.add(picture);
            this.pictures.push(picture);
            this.orderPicturesBook.push(picture.indexPicture);
            nameBoxGeometry = new THREE.PlaneGeometry(8, 1, 0.1, 0.1);
            nameBoxMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/name/7.png"), side: THREE.DoubleSide});
            nameBox = new THREE.Mesh(nameBoxGeometry, nameBoxMaterial);
            nameBox.position.set(-10, 13.5, -12);
            scene.add(nameBox);
            pictureGeometry = new THREE.PlaneGeometry(8, 4, 0.1, 0.1);
            pictureMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/8.jpg"), side: THREE.DoubleSide});
            picture = new THREE.Mesh(pictureGeometry, pictureMaterial);
            picture.name = "picture_08";
            picture.position.set(0, 16.5, -12);
            picture.objectType = 1;          //Image type
            picture.indexPicture = 8;
            scene.add(picture);
            this.pictures.push(picture);
            this.orderPicturesBook.push(picture.indexPicture);
            nameBoxGeometry = new THREE.PlaneGeometry(8, 1, 0.1, 0.1);
            nameBoxMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/name/8.png"), side: THREE.DoubleSide});
            nameBox = new THREE.Mesh(nameBoxGeometry, nameBoxMaterial);
            nameBox.position.set(0, 13.5, -12);
            scene.add(nameBox);
            pictureGeometry = new THREE.PlaneGeometry(8, 4, 0.1, 0.1);
            pictureMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/9.jpg"), side: THREE.DoubleSide});
            picture = new THREE.Mesh(pictureGeometry, pictureMaterial);
            picture.position.set(10, 16.5, -12);
            picture.objectType = 1;          //Image type
            picture.indexPicture = 9;
            picture.name = "picture_09";
            scene.add(picture);
            this.pictures.push(picture);
            this.orderPicturesBook.push(picture.indexPicture);
            nameBoxGeometry = new THREE.PlaneGeometry(8, 1, 0.1, 0.1);
            nameBoxMaterial = new THREE.MeshBasicMaterial({map: textureLoader.load("./assets/textures/historical-figures/pictures/name/9.png"), side: THREE.DoubleSide});
            nameBox = new THREE.Mesh(nameBoxGeometry, nameBoxMaterial);
            nameBox.position.set(10, 13.5, -12);
            scene.add(nameBox);
		},
		createScenary: function () {
			this.createCameraPositionPanel();

			let camera = new THREE.PerspectiveCamera(
				50, window.innerWidth / window.innerHeight,
				0.1, 1000
			); 
			camera.up.set(0, 1, 0);
			camera.position.set(-5 + this.cameraOption * 5, 10, 6);
			this.defaultCamera = camera;

			// VR cameras attributes
			groupCenter = new THREE.Group();
			cameraVR = new THREE.PerspectiveCamera(
				50,
				window.innerWidth / window.innerHeight,
				0.1,
				1000
			);
			cameraVR.position.set(0, 1.6, 0);
			user = new THREE.Group(); // This helps move the camera
			user.position.set(
				this.defaultCamera.position.x,
				this.defaultCamera.position.y,
				this.defaultCamera.position.z
			);
			scene.add(user);
			user.add(cameraVR);
			let geometryMarker = new THREE.RingGeometry(14 * 0.0025, 14 * 0.005, 64); 
			let materialMarker = new THREE.MeshBasicMaterial({ color: 0xffff00 });
			marker = new THREE.Mesh(geometryMarker, materialMarker);
			cameraVR.add(marker);
			marker.position.set(0, 0, -5); 
			geometryMarker = new THREE.RingGeometry(15 * 0.0025, 15 * 0.003, 64);
			materialMarker = new THREE.MeshBasicMaterial({ color: 0x00000 });
			let circleBGMarker = new THREE.Mesh(geometryMarker, materialMarker);
			cameraVR.add(circleBGMarker);
			circleBGMarker.position.set(0, 0, -5); 
			geometryMarker = new THREE.RingGeometry(14 * 0.005, 14 * 0.006, 64);
			materialMarker = new THREE.MeshBasicMaterial({ color: 0x00000 });
			circleBGMarker.add(new THREE.Mesh(geometryMarker, materialMarker));
			groupCenter.position.set(0, 0, -5); 
			marker.add(groupCenter);
			let spotLight = new THREE.SpotLight(0xffffff);
			spotLight.position.copy(new THREE.Vector3(0, 15, 15));
			spotLight.shadow.mapSize.width = 2048;
			spotLight.shadow.mapSize.height = 2048;
			spotLight.shadow.camera.fov = 15;
			spotLight.castShadow = true;
			spotLight.decay = 2;
			spotLight.penumbra = 0.05;
			spotLight.name = "spotLight";
			scene.add(spotLight);
			let ambientLight = new THREE.AmbientLight(0x343434);
			ambientLight.name = "ambientLight";
			scene.add(ambientLight);

			// Show axes (parameter is size of each axis)
			// let axes = new THREE.AxesHelper(24);
			// axes.name = "AXES";
			// axes.visible = true;
			// scene.add(axes);

			let groundPlane = createGroundPlane(30, 30); // width and height
			groundPlane.rotateX(THREE.Math.degToRad(-90));
			scene.add(groundPlane);

			this.createMenu();
			this.createImageClone();
			this.createPicturesPanel(scene);
			this.orderPicturesBook = this.shuffleList(this.orderPicturesBook);
			this.createBook();
			this.createButtons();
			this.createMessages();

			animationList = [];
			objectRaycaster = [];
			objectRaycasterClonePictures = [];

			this.book.rotateX(THREE.Math.degToRad(10));
			this.book.position.set(0, this.book.position.y + 1, 0);
			this.cameraPositionPanel.rotateY(THREE.Math.degToRad(-45));

			// Pages of book
			for (let i = 0; i < this.book.children.length; i++) {
				let pageGroupRotation = this.book.children[i];
				for (let j = 0; j < pageGroupRotation.children.length; j++) {
					objectRaycaster.push(pageGroupRotation.children[j]); //Put inside only page without the group rotation
					objectRaycaster.push(pageGroupRotation.children[j].children[0]); // Image Block
				}
			}

			// Adding the images of paintwall
			for (let i = 0; i < this.pictures.length; i++) {
				objectRaycaster.push(this.pictures[i]);
				objectRaycasterClonePictures.push(this.pictures[i]);
			}

			// Buttons
			for (let i = 0; i < this.buttons.length; i++) {
				objectRaycaster.push(this.buttons[i]);
			}

			// Raycaster and mouse Controllers
			objectLooked = null;
			selectedImage = null;
		},
		emptyScene: function () {
			while (scene.children.length > 0) {
				//OU scene.remove.apply(scene, scene.children);
				scene.remove(scene.children[0]);
			}
			this.fails = 0;
			this.hits = 0;
			this.state = 0;
			this.timer.seconds = 0;
			this.timer.minutes = 0;
			this.amountSheets = 0;
			this.currentSheet = 0;
			this.amountPages = 0;
			this.buttons = [];
			this.pictures = [];
			this.orderPicturesBook = [];
			objectLooked = null;
			selectedImage = null;
			objectRaycaster = [];
			objectRaycasterClonePictures = [];
			this.imageClone = null;
			this.cameraOption = 1;
			this.cameraPanel = new THREE.Group();
			this.book = new THREE.Group();
		},
		removeEntity: function (object) {
			let selected = scene.getObjectByName(object.name);
			scene.remove(selected);
		},
		removePictureFromWall: function (image, imagePlane) {
			for (let i = 0; i < this.pictures.length; i++) {
				if (this.pictures[i].indexPicture == image.indexPicture) {
					this.pictures.splice(i, 1);
					break;
				}
			}

			for (let j = 0; j < objectRaycaster.length; j++) {
				if (objectRaycaster[j].objectType === 1) {
					// picture of the wall
					if (objectRaycaster[j].indexPicture === image.indexPicture) {
						objectRaycaster.splice(j, 1);
						break;
					}
				}
			}
			for (let j = 0; j < objectRaycaster.length; j++) {
				if (objectRaycaster[j] === imagePlane) {
					// Remove imageBlock of the page
					objectRaycaster.splice(j, 1);
					break;
				}
			}

			for (let j = 0; j < objectRaycasterClonePictures.length; j++) {
				if ( objectRaycasterClonePictures[j].indexPicture == image.indexPicture) {
					objectRaycasterClonePictures.splice(j, 1);
					break;
				}
			}
			this.removeEntity(image);
			objectLooked = null;
			selectedImage = null;
			controls.imageClone.position.set(-100, -100, -100);
			controls.imageClone.rotateX(THREE.Math.degToRad(90));
		},
		removeAllPictures: function () {
			for (let i = 0; i < this.pictures.length; i++) {
				let aux = this.pictures[i];
				this.removeEntity(aux);
			}
			objectRaycasterClonePictures = [];
			objectLooked = null;
			selectedImage = null;
			controls.imageClone.position.set(-100, -100, -100);
			controls.imageClone.rotateX(THREE.Math.degToRad(90));
		},
		shuffleList: function (list) {
			let auxOrderList = [];
			let auxList = [];
			for (let i = 0; i < list.length; i++) {
				auxList.push(list[i]);
			}
			for (let i = 0; i < auxList.length; i++) {
				let randomIndex = Math.floor(Math.random() * auxList.length);
				auxOrderList.push(auxList[randomIndex]);
				auxList.splice(randomIndex, 1);
				i--; // FIX remove when works with ".length"
			}
			return auxOrderList;
		},
		updateCameraPosition: function(){
			this.defaultCamera.position.set(-5 + this.cameraOption * 5, 10, 6 + 0);
			// this.defaultCamera.position.set(-5 + this.cameraOption * 5, 11, 4.5);
			user.position.set(this.defaultCamera.position.x, this.defaultCamera.position.y, this.defaultCamera.position.z);
		},
	};
	controls.createScenary();

	// Reajuste da renderização com base na mudança da janela
	function onResize() {
		// Atualiza o aspect da camera com relação as novas dimensões
		controls.defaultCamera.aspect = window.innerWidth / window.innerHeight;
		controls.defaultCamera.updateProjectionMatrix();
		cameraVR.aspect = window.innerWidth / window.innerHeight;
		cameraVR.updateProjectionMatrix();
		renderer.setSize(window.innerWidth, window.innerHeight); //Define os novos valores para o renderizador
	}

	window.addEventListener("resize", onResize, false); // Ouve os eventos de resize

	// Adiciona o renderer no elemento de VR
	document.body.appendChild(VRButton.createButton(renderer));

	/************************************************
	 *
	 * CONTROLADOR DO VR
	 *
	 ************************************************/

	let controller1 = renderer.xr.getController(0);
	/** 
	 * https://developer.mozilla.org/en-US/docs/Web/API/XRSession
	 *  O evento select é enviado após o evento selectStart e imediatamente antes do evento 
	 *  selectEnd ser enviado. Se o select nao for enviado, a ação de seleção termina antes de 
	 *  ser concluída.
	 *  Evento disparado depois do onSelectStart e antes do onSelectEnd
	 *  Dispara no momento que o botão do controle é solto
	 */
	// controller1.addEventListener("select", onSelect);
	controller1.addEventListener("selectstart", onSelectStart);
	controller1.addEventListener("selectend", onSelectEnd);

	let controller2 = renderer.xr.getController(1);
	// controller2.addEventListener("select", onSelect);
	controller2.addEventListener("selectstart", onSelectStart);
	controller2.addEventListener("selectend", onSelectEnd);
	scene.add(controller2);

	const controllerModelFactory = new XRControllerModelFactory();

	let controllerGrip1 = renderer.xr.getControllerGrip(0);
	controllerGrip1.add(
		controllerModelFactory.createControllerModel(controllerGrip1)
	);
	scene.add(controllerGrip1);

	let controllerGrip2 = renderer.xr.getControllerGrip(1);
	controllerGrip2.add(
		controllerModelFactory.createControllerModel(controllerGrip2)
	);
	scene.add(controllerGrip2);

	// Dispara no momento que o botão do controle é pressionado
	function onSelectStart(event) {
		const controller = event.target;
		if (objectLooked != null) {
			raycasterController(controller);
		}
	}

	function onSelectEnd(event) {
		if (objectLooked != null && objectLooked.objectType == 2) {
			if (selectedImage != null) {
				if (objectLooked.indexPicture == selectedImage.indexPicture) {
					objectLooked.material = selectedImage.material.clone(); // Generate a clone of material and replace on image plane
					controls.hits++;
					controls.removePictureFromWall(selectedImage, objectLooked); // Remove imagePlane and picture of panel
					if (controls.pictures.length == 0) {
						controls.state = 1;
						controls.messageVictory.visible = true;
					}
				} else {
					controls.fails++;
					if (controls.fails > 2) {
						controls.state = 2;
						controls.removeAllPictures();
						controls.messageLoose.visible = true;
					}
				}
				objectImagePlane.material.color = new THREE.Color("rgb(255,255,255)");
				objectImagePlane = null;
				controls.imageClone.position.set(-100, -100, -100);
				controls.imageClone.rotation.set(0, 0, 0);
				groupCenter.children = [];
			}
		}
		if (selectedImage != null) {
			// Drop the picture
			selectedImage.visible = true;
			controls.imageClone.position.set(-100, -100, -100);
			controls.imageClone.rotation.set(0,0,0);
			groupCenter.children = [];
		}
		selectedImage = null;
	}

	function raycasterController(controller) {
		switch (objectLooked.objectType) {
			case 0:
				if (objectLooked.sheet.animationAngle == 0) {
					//Don't rotate if the page is moving
					if (objectLooked.sheet.sideOption == 0) {
						objectLooked.sheet.sideOption = 1;
						controls.currentSheet++;
					} else {
						objectLooked.sheet.sideOption = 0;
						controls.currentSheet--;
					}
					animationList.push(objectLooked.sheet);
				}
				break;
			case 1: // Collide with image
				selectedImage = objectLooked;
				selectedImage.visible = false;
				controls.imageClone.position.x = marker.position.x;
				controls.imageClone.position.y = 0.1;
				controls.imageClone.position.z = -6.35;
				controls.imageClone.rotateX(THREE.Math.degToRad(-90));
				groupCenter.add(controls.imageClone);
				controls.imageClone.rotateX(THREE.Math.degToRad(35));
				let materialAux = controls.imageClone.material.clone();
				controls.imageClone.material = new THREE.MeshBasicMaterial({
					transparent: true, opacity: 0.5,
					map: materialAux.map,
					side: THREE.DoubleSide,
				});
				break;
			case 2: // Collide with imagePlane on Page
				//
				//
				break;
			case 3: // Retry Button
				console.clear();
				controls.emptyScene();
				controls.createScenary();
				break;
			case 4: // Previous button
				controls.cameraOption = controls.cameraOption > 0 ? controls.cameraOption - 1 : controls.cameraQuantity - 1;
				controls.updateCameraPosition();
				break;
			case 5: // Next button
				controls.cameraOption = controls.cameraOption < 2 ? controls.cameraOption + 1 : 0;
				controls.updateCameraPosition();
				break;
		}
	}

	function getIntersections(elements) {
		raycaster.setFromCamera(
			{x: marker.position.x, y: marker.position.y},
			cameraVR
		);
		return raycaster.intersectObjects(elements);
	}

	function checkRaycaster() {
		let intersects = getIntersections(objectRaycaster);
		if (intersects.length > 0) {
			objectLooked = intersects[0].object;
			pointCollisionRayCaster = intersects[0].point;
			if (!objectLooked.visible) {
				objectLooked = null;
				pointCollisionRayCaster = null;
			}
		} else {
			objectLooked = null;
			pointCollisionRayCaster = null;
		}
	}

	// Only verify if has a collision with the pictures
	function checkRaycasterClonePictures() {
		if (selectedImage == null) {
			// FIX the bug of change the picture when moving above another picture
			raycasterPictures.setFromCamera(
				{ x: marker.position.x, y: marker.position.y },
				cameraVR
			);
			let intersects = raycasterPictures.intersectObjects(
				objectRaycasterClonePictures
			);
			if (intersects.length > 0) {
				let pictureLooked = intersects[0].object;
				if (pictureLooked.visible && objectLooked.visible) {					
					// picture is not visible, only the clone it is
					controls.imageClone.position.x = pictureLooked.position.x;
					controls.imageClone.position.y = pictureLooked.position.y;
					controls.imageClone.position.z = pictureLooked.position.z  + 0.2;
					controls.imageClone.material = pictureLooked.material.clone();
				}
			}
		}
	}

	// A cor do espaço de imagem na pagina muda pra verde

	function checkRaycasterOnImageAtPages() {
		if (objectLooked != null && selectedImage != null && objectLooked.objectType == 2
		) {
			objectImagePlane = objectLooked;
			objectImagePlane.material.color = new THREE.Color("rgb(0,180,0)");
		} else {
			if (objectImagePlane != null) {
				objectImagePlane.material.color = new THREE.Color("rgb(255,255,255)");
				objectImagePlane = null;
			}
		}
	}

	renderer.setAnimationLoop(render);

	function render(t) {
		dt = (t - timeAfter) / 1000;
		checkRaycaster();
		controls.animationScenary();
		switch (controls.state) {
			case 0: // Game Running
				controls.timer.updateTime(dt);
				if (controls.cameraOption == 0) {
					checkRaycasterOnImageAtPages();
					checkRaycasterClonePictures();
					// movePictureFromPanel();
				}
				break;
			case 1: // Victory
				break;
			case 2: // Loose
				break;
		}
		renderer.render(scene, cameraVR);
		timeAfter = t;
		requestAnimationFrame(render);
	}

	// Add a small and simple ground plane
	function createGroundPlane(width, height) {
		// create the ground plane
		var planeGeometry = new THREE.PlaneGeometry(width, height, 10, 10);
		var planeMaterial = new THREE.MeshStandardMaterial({
			map: textureLoader.load("./assets/textures/floor-wood.jpg"),
			side: THREE.DoubleSide,
		});
		var plane = new THREE.Mesh(planeGeometry, planeMaterial);
		plane.receiveShadow = true;
		return plane;
	}
}

// Exportando métodos e variáveis que serão vísiveis no módulo
export {main};
