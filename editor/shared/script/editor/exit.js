/*
TODO:
- add endings and "triggers"
- rename tool?
	- rename everything that is so exit specific
- remove areEndingsVisible
- triggers
	- alternate names: events (EVT), effects (EFF, EFX, EFC, EFCT)

TODO:
- advanced exit TODO:
	X play dialog on (before?) exit
	X script return values
	X lock exits on return false
	- {changeAvatar} function
	X room transitions system
	- {nextTransition} function
	- change how sprites work?
		- allow multiple?
		- allow switching of avatar
	- consider changes to scripting format
		X return values
		X {} multi-line blocks (functions??)
		- deprecate """ blocks?
		- replace DLG with SCRIPT (name?) blocks?
		- bigger API? scene objects?? structs??
	- consider "triggers" AKA script-only exits
		EXT 0,0 NULL DLG dlg_id (or something) (what about? TRG 0,0 dlg_id)

=== object and function notation ideas ===
-- anonymous object
{obj var1=a var2=b} // create instance
{obj : var1=a var2=b} // with separator
-- named object
{obj name : var1=a var2} // define prototype (globally?)
{new name var2=c} // create instance
-- access object properties
{obj1.x = 5} // set
{2 == obj1.y} // test value
{obj1.func a b} // call method
-- anonymous function
fx = {func param1 param2 => body} // create
{fx a b} // invoke
{func : param1 param2 => body} // create with separator
-- named function
{func name : param1 param2 => body} // define (globally?)
{name a b} // invoke

transition system notes
- fade: black, white, color?
- slide: left, right, up, down
- other? fuzz, wave, flash, pie circle, circle collapse (cartoon end), other??
- this basically requires a post-processing effect
- TODO
	- make sure it is pixel bound to the correct resolution 128 x 128
	- try a few effects!
	- try limiting the frame rate!
	- make real transition manager object

changeAvatar notes
// TODO : this is kind of hacky
// - needs to work with names too
// - should it work only on the drawing? or other things too??
// - need to think about how the sprite model should work (multiple sprites?)
// 		- will avatars still need to be unique in a multi sprite world?
// - need a way to detect the sprite ID / name in code {avatarName} (or something???)

NOTES
- now would also be a good time to consider adding code commenting
- should exit dialog be regular dialog?? or "narration"?? or should there be a variable/function to control it?
- improve the two-way arrows for exits
- should I allow multiple copies of sprites?
- should I have enums or something for the exit types / transition types: exit.locked, exit.no_transition, exit.fade_white???

- exit dialog
	- file format
	- new script functions
	- UI control

NOTES / ideas:
- stop room tool relying on "curRoom" -- give it an internal state
- show exit count to help navigation??
- should I have direct exit value manipulation (room + coords) as dropdowns?
- better logic for initial placement of entrance / exit for door
- there is some kind of bug with the title disappearing off of games

TODO advanced exits:
- transition animations
- swap characters
X play dialog
X lock based on return value

plan for advanced exits:
- exits can have an associated dialog
	EXT 13,4 0 7,9 DLG EXT_15
- if the dialog script returns true you can enter it.. otherwise it's cancelled
- it can play dialog as normal
- other features are new functions
	- {changeAvatar}
	- {nextTransition}
- detect supported scripts and show UI for that
	- arbitrary scripts can be run through "custom" plaintext

advanced exit notes:
- should there be a "trigger" option where there is no actual exit.. just a script that's run?
*/


function ExitTool(exitCanvas1, exitCanvas2, endingCanvas) {
	console.log("NEW EXIT TOOL");
	console.log(endingCanvas);
	console.log(curRoom);

	var selectedRoom = null;

	var exitInfoList = [];
	var curExitInfo = null;

	exitCanvas1.width = width * scale; // TODO : globals?
	exitCanvas1.height = width * scale;
	var exitCtx1 = exitCanvas1.getContext("2d");

	exitCanvas2.width = width * scale; // TODO : globals?
	exitCanvas2.height = width * scale;
	var exitCtx2 = exitCanvas2.getContext("2d");

	// TODO : re-use the exit canvases instead?
	endingCanvas.width = width * scale;
	endingCanvas.height = width * scale;
	var endingCtx = endingCanvas.getContext("2d");
	console.log(endingCtx);

	var PlacementMode = { // TODO : awkward name
		None : 0,
		Exit : 1,
		Destination : 2 // TODO : will I have to rename this?
	};
	var placementMode = PlacementMode.None;

	// NOTE: the "link state" is a UI time concept -- it is not stored in the game data
	var LinkState = {
		TwoWay : 0, // two way exit
		OneWayOriginal : 1, // one way exit - in same state as when it was "gathered"
		OneWaySwapped : 2, // one way exit - swapped direction from how it was "gathered"
	};

	UpdatePlacementButtons();

	this.AddExit = function() {
		console.log(room);
		var newExit = {
			x : 0,
			y : 0,
			dest : { // start with valid destination so you can't accidentally uncreate exits
				room : "0",
				x : 15,
				y : 15
			}
		}
		room[selectedRoom].exits.push( newExit );

		var newReturn = {
			x : newExit.dest.x,
			y : newExit.dest.y,
			dest : {
				room : selectedRoom,
				x : newExit.x,
				y : newExit.y
			}
		}
		room[newExit.dest.room].exits.push( newReturn );

		exitInfoList = GatherExitInfoList();
		curExitInfo = exitInfoList.find(function(e) { return e.exit == newExit; });

		RenderExits();
		refreshGameData();
	};

	this.SetRoom = function(roomId) {
		selectedRoom = roomId;
		ResetExitList();
	}

	this.Refresh = function() { // TODO: rename "Reset"???
		curExitInfo = null;
		ResetExitList();
	}

	function ResetExitList() {
		exitInfoList = GatherExitInfoList();

		if (curExitInfo != null) {
			// check for exit info that duplicates the carry over exit info
			var duplicate = exitInfoList.find(function(info) {
				return (curExitInfo.exit == info.exit && curExitInfo.return == info.return) ||
					(curExitInfo.exit == info.return && curExitInfo.return == info.exit);
			});
			if (duplicate != undefined && duplicate != null) {
				// if there is a duplicate.. replace it with the carry over exit
				exitInfoList[exitInfoList.indexOf(duplicate)] = curExitInfo;
			}
		}
		else {
			if (exitInfoList.length > 0) {
				// fallback selected exit
				curExitInfo = exitInfoList[0];
			}
		}

		RenderExits();
	}

	function RenderExits() {
		if (curExitInfo != null) {
			var w = tilesize * scale;
			if (curExitInfo.type == ExitType.Exit) {
				document.getElementById("exitsSelect").style.display = "flex";
				document.getElementById("endingsSelect").style.display = "none";

				// just tacking this on here to make sure it updates
				UpdateExitDirectionUI();

				var exitCtx = exitCtx1;
				var destCtx = exitCtx2;
				if (curExitInfo.linkState == LinkState.OneWaySwapped) {
					exitCtx = exitCtx2;
					destCtx = exitCtx1;
				}

				drawRoom( room[curExitInfo.parentRoom], exitCtx );

				exitCtx.fillStyle = getContrastingColor(room[curExitInfo.parentRoom].pal);
				exitCtx.strokeStyle = getContrastingColor(room[curExitInfo.parentRoom].pal);
				exitCtx.lineWidth = 4;
				exitCtx.fillRect(curExitInfo.exit.x * w, curExitInfo.exit.y * w, w, w);
				exitCtx.strokeRect((curExitInfo.exit.x * w) - (w/2), (curExitInfo.exit.y * w) - (w/2), w * 2, w * 2);

				drawRoom( room[curExitInfo.exit.dest.room], destCtx );

				destCtx.fillStyle = getContrastingColor(room[curExitInfo.exit.dest.room].pal);
				destCtx.strokeStyle = getContrastingColor(room[curExitInfo.exit.dest.room].pal);
				destCtx.lineWidth = 4;
				destCtx.fillRect(curExitInfo.exit.dest.x * w, curExitInfo.exit.dest.y * w, w, w);
				destCtx.strokeRect((curExitInfo.exit.dest.x * w) - (w/2), (curExitInfo.exit.dest.y * w) - (w/2), w * 2, w * 2);
			}
			else if (curExitInfo.type == ExitType.Ending) {
				document.getElementById("exitsSelect").style.display = "none";
				document.getElementById("endingsSelect").style.display = "flex";

				drawRoom( room[curExitInfo.parentRoom], endingCtx );

				endingCtx.fillStyle = getContrastingColor(room[curExitInfo.parentRoom].pal);
				endingCtx.strokeStyle = getContrastingColor(room[curExitInfo.parentRoom].pal);
				endingCtx.lineWidth = 4;
				endingCtx.fillRect(curExitInfo.ending.x * w, curExitInfo.ending.y * w, w, w);
				endingCtx.strokeRect((curExitInfo.ending.x * w) - (w/2), (curExitInfo.ending.y * w) - (w/2), w * 2, w * 2);
			}
		}
		else {
			exitCtx1.clearRect(0, 0, exitCanvas1.width, exitCanvas1.height);
			exitCtx2.clearRect(0, 0, exitCanvas2.width, exitCanvas2.height);
		}
	}

	this.RemoveExit = function() {
		if (curExitInfo.hasReturn) {
			var returnIndex = room[curExitInfo.exit.dest.room].exits.indexOf(curExitInfo.return);
			room[curExitInfo.exit.dest.room].exits.splice(returnIndex,1);
		}
		var exitIndex = room[curExitInfo.parentRoom].exits.indexOf(curExitInfo.exit);
		room[curExitInfo.parentRoom].exits.splice(exitIndex,1);

		exitInfoList = GatherExitInfoList();
		curExitInfo = exitInfoList.length > 0 ? exitInfoList[0] : null;

		RenderExits();
		refreshGameData();
	}

	this.IsPlacingExit = function () {
		return placementMode != PlacementMode.None;
	}

	this.GetSelectedExit = function() {
		if (curExitInfo != null) {
			return curExitInfo.exit;
		}
		else {
			return null;
		}
	}

	// TODO name? GetSelectedEvent ? GetSelectedEventLocation?
	this.GetSelectedLocation = function() {
		return curExitInfo;
	}

	this.GetSelectedReturn = function() {
		if (curExitInfo != null && curExitInfo.hasReturn) {
			return curExitInfo.return;
		}
		else {
			return null;
		}
	}

	this.TrySelectExitAtLocation = function(x,y) {
		if (placementMode != PlacementMode.None) {
			return false;
		}

		var foundExit = FindExitAtLocation(x,y);
		if (foundExit != null) {
			curExitInfo = foundExit;
		}
		RenderExits();

		return curExitInfo != null;
	}

	function FindExitAtLocation(x,y) {
		for (var i = 0; i < exitInfoList.length; i++) {
			var exitInfo = exitInfoList[i];
			if (exitInfo.parentRoom === selectedRoom) {
				if (exitInfo.exit.x == x && exitInfo.exit.y == y) {
					return exitInfo;
				}
				else if (exitInfo.exit.dest.x == x && exitInfo.exit.dest.y == y) {
					return exitInfo;
				}
			}
			else if (exitInfo.exit.dest.room === selectedRoom) {
				if (exitInfo.exit.dest.x == x && exitInfo.exit.dest.y == y) {
					return exitInfo;
				}
			}
		}
		return null;
	}

	this.TogglePlacingExit = function(isPlacing) {
		if (isPlacing) {
			placementMode = PlacementMode.Exit;
		}
		else {
			placementMode = PlacementMode.None;
		}
		UpdatePlacementButtons();
	}

	this.TogglePlacingDestination = function(isPlacing) {
		if (isPlacing) {
			placementMode = PlacementMode.Destination;
		}
		else {
			placementMode = PlacementMode.None;
		}
		UpdatePlacementButtons();
	}

	this.SelectExitRoom = function() {
		// hacky global method!!
		if (curExitInfo != null) {
			selectRoom(curExitInfo.parentRoom);
		}
	}

	this.SelectDestinationRoom = function() {
		console.log("SELECT DEST ROOM");
		// hacky global method!!
		if (curExitInfo != null) {
			selectRoom(curExitInfo.exit.dest.room);
		}
	}

	function UpdatePlacementButtons() {
		// hackily relies on global UI names oh well D:
		if (placementMode == PlacementMode.Exit) {
			document.getElementById("toggleMoveExitDoor1").checked = true;
			document.getElementById("textMoveExitDoor1").innerText = "moving"; // TODO localize
			document.getElementById("cancelMoveExitDoor1").style.display = "inline";
		}
		else {
			document.getElementById("toggleMoveExitDoor1").checked = false;
			document.getElementById("textMoveExitDoor1").innerText = "move door"; // TODO localize
			document.getElementById("cancelMoveExitDoor1").style.display = "none";
		}

		if (placementMode == PlacementMode.Destination) {
			document.getElementById("toggleMoveExitDoor2").checked = true;
			document.getElementById("textMoveExitDoor2").innerText = "moving"; // TODO localize
			document.getElementById("cancelMoveExitDoor2").style.display = "inline";
		}
		else {
			document.getElementById("toggleMoveExitDoor2").checked = false;
			document.getElementById("textMoveExitDoor2").innerText = "move door"; // TODO localize
			document.getElementById("cancelMoveExitDoor2").style.display = "none";
		}

		// TODO : this behaves oddly... change??
		// if (placementMode == PlacementMode.None) {
		// 	document.body.style.cursor = "pointer";
		// }
		// else {
		// 	document.body.style.cursor = "crosshair";
		// }
	}

	this.PlaceExit = function(x,y) {
		if (placementMode == PlacementMode.Exit) {
			if (curExitInfo != null) {
				// return (change return destination)
				if (curExitInfo.hasReturn) {
					curExitInfo.return.dest.room = selectedRoom;
					curExitInfo.return.dest.x = x;
					curExitInfo.return.dest.y = y;
				}

				// room
				if (curExitInfo.parentRoom != selectedRoom) {
					var oldExitIndex = room[curExitInfo.parentRoom].exits.indexOf(curExitInfo.exit);
					room[curExitInfo.parentRoom].exits.splice(oldExitIndex,1);
					room[selectedRoom].exits.push(curExitInfo.exit);
					curExitInfo.parentRoom = selectedRoom;
				}

				// exit pos
				curExitInfo.exit.x = x;
				curExitInfo.exit.y = y;

				refreshGameData();
				ResetExitList();
			}
		}
		else if (placementMode == PlacementMode.Destination) {
			if (curExitInfo != null) {
				// return (change return origin)
				if (curExitInfo.hasReturn) {
					if (curExitInfo.exit.dest.room != selectedRoom) {
						var oldReturnIndex = room[curExitInfo.exit.dest.room].exits.indexOf(curExitInfo.return);
						room[curExitInfo.exit.dest.room].exits.splice(oldReturnIndex,1);
						room[selectedRoom].exits.push(curExitInfo.return);
					}

					curExitInfo.return.x = x;
					curExitInfo.return.y = y;
				}

				// room
				curExitInfo.exit.dest.room = selectedRoom;

				// destination pos
				curExitInfo.exit.dest.x = x;
				curExitInfo.exit.dest.y = y;

				refreshGameData();
				ResetExitList();
			}
		}

		placementMode = PlacementMode.None;
		UpdatePlacementButtons();
	}

	this.PrevExit = function() {
		if (exitInfoList.length > 0) {
			if (curExitInfo != null) {
				var index = exitInfoList.indexOf(curExitInfo);
				if (index != -1) {
					index--;
					if (index < 0) {
						index = exitInfoList.length - 1;
					}

					curExitInfo = exitInfoList[index];
				}
				else {
					curExitInfo = exitInfoList[0];
				}
			}
			else {
				curExitInfo = exitInfoList[0];
			}
		}
		else {
			curExitInfo = null;
		}
		RenderExits();
	}

	this.NextExit = function() {
		if (exitInfoList.length > 0) {
			if (curExitInfo != null) {
				var index = exitInfoList.indexOf(curExitInfo);
				if (index != -1) {
					index++;
					if (index >= exitInfoList.length) {
						index = 0;
					}

					curExitInfo = exitInfoList[index];
				}
				else {
					curExitInfo = exitInfoList[0];
				}
			}
			else {
				curExitInfo = exitInfoList[0];
			}
		}
		else {
			curExitInfo = null;
		}
		RenderExits();
	}

	function GatherExitInfoList()
	{
		console.log("GATHER EXITS!!");

		var infoList = [];

		var findReturnExit = function(parentRoom, startExit) {
			var returnExit = null;
			for (var j in room[startExit.dest.room].exits) {
				var otherExit = room[startExit.dest.room].exits[j];
				if (otherExit.dest.room === parentRoom &&
					otherExit.dest.x == startExit.x && otherExit.dest.y == startExit.y) {
						returnExit = otherExit;
				}
			}
			return returnExit;
		}

		for (var i in room[selectedRoom].exits) {
			var localExit = room[selectedRoom].exits[i];
			var returnExit = findReturnExit(selectedRoom, localExit);

			if (returnExit != null) {
				var alreadyExistingExitInfo = infoList.find(function(e) { return e.exit == returnExit; });
				if (alreadyExistingExitInfo != null && alreadyExistingExitInfo != undefined) {
					continue; // avoid duplicates when both parts of a paired exit are in the same room
				}
			}

			// infoList.push({
			// 	type: ExitType.Exit,
			// 	parentRoom: selectedRoom,
			// 	exit: room[selectedRoom].exits[i],
			// 	hasReturn: returnExit != null,
			// 	return: returnExit,
			// 	linkState: returnExit ? LinkState.TwoWay : LinkState.OneWayOriginal
			// });

			infoList.push(
				new ExitLocation(
					selectedRoom,
					room[selectedRoom].exits[i],
					returnExit != null,
					returnExit,
					returnExit ? LinkState.TwoWay : LinkState.OneWayOriginal)
				);
		}

		for (var r in room) {
			if (r != selectedRoom) {
				for (var i in room[r].exits) {
					var exit = room[r].exits[i];
					if (exit.dest.room === selectedRoom && findReturnExit(r,exit) == null) {
						// infoList.push({
						// 	type: ExitType.Exit,
						// 	parentRoom: r,
						// 	exit: exit,
						// 	hasReturn: false,
						// 	return: null,
						// 	linkState: LinkState.OneWayOriginal
						// });

						infoList.push(
							new ExitLocation(
								r,
								exit,
								false,
								null,
								LinkState.OneWayOriginal)
							);
					}
				}
			}
		}

		for (var e in room[selectedRoom].endings) {
			var ending = room[selectedRoom].endings[e];
			// infoList.push({
			// 	type: ExitType.Ending,
			// 	parentRoom: selectedRoom,
			// 	ending: ending
			// });

			infoList.push(
				new EndingLocation(
					selectedRoom,
					ending)
				);
		}

		return infoList;
	}

	var dragMode = PlacementMode.None;
	var dragExitInfo = null;
	this.StartDrag = function(x,y) {
		dragMode == PlacementMode.None;
		dragExitInfo = FindExitAtLocation(x,y);

		if (dragExitInfo != null) {
			if (dragExitInfo.parentRoom === selectedRoom &&
					dragExitInfo.exit.x == x && dragExitInfo.exit.y == y) {
				dragMode = PlacementMode.Exit;
			}
			else if (dragExitInfo.exit.dest.room === selectedRoom &&
						dragExitInfo.exit.dest.x == x && dragExitInfo.exit.dest.y == y) {
				dragMode = PlacementMode.Destination;
			}
		}
	}

	this.ContinueDrag = function(x,y) {
		if (dragExitInfo == null) {
			return;
		}

		if (dragMode == PlacementMode.Exit) {
			dragExitInfo.exit.x = x;
			dragExitInfo.exit.y = y;
			if (dragExitInfo.hasReturn) {
				dragExitInfo.return.dest.x = x;
				dragExitInfo.return.dest.y = y;
			}
		}
		else if (dragMode == PlacementMode.Destination) {
			dragExitInfo.exit.dest.x = x;
			dragExitInfo.exit.dest.y = y;
			if (dragExitInfo.hasReturn) {
				dragExitInfo.return.x = x;
				dragExitInfo.return.y = y;
			}
		}
		
		refreshGameData();
		RenderExits();
	}

	this.EndDrag = function() {
		if (dragMode != PlacementMode.None) {
			dragMode = PlacementMode.None;
			dragExitInfo = null;
			refreshGameData();
			RenderExits();
		}
	}

	this.IsDraggingExit = function() {
		return dragMode != PlacementMode.None;
	}

	this.GetExitInfoList = function() {
		console.log("get exit info " + selectedRoom);
		// ResetExitList(); // make sure we are up to date!
		return exitInfoList;
	}

	this.ChangeExitLink = function() {
		function swapExitAndEntrance() {
			var tempDestRoom = curExitInfo.parentRoom;
			var tempDestX = curExitInfo.exit.x;
			var tempDestY = curExitInfo.exit.y;

			// remove exit from current parent room
			var exitIndex = room[curExitInfo.parentRoom].exits.indexOf(curExitInfo.exit);
			room[curExitInfo.parentRoom].exits.splice(exitIndex,1);

			// add to destination room
			room[curExitInfo.exit.dest.room].exits.push(curExitInfo.exit);
			curExitInfo.parentRoom = curExitInfo.exit.dest.room;

			// swap positions
			curExitInfo.exit.x = curExitInfo.exit.dest.x;
			curExitInfo.exit.y = curExitInfo.exit.dest.y;
			curExitInfo.exit.dest.room = tempDestRoom;
			curExitInfo.exit.dest.x = tempDestX;
			curExitInfo.exit.dest.y = tempDestY;
		}

		if (curExitInfo != null) {
			if (curExitInfo.linkState == LinkState.TwoWay) {
				// -- get rid of return exit --
				if (curExitInfo.hasReturn) {
					var returnIndex = room[curExitInfo.exit.dest.room].exits.indexOf(curExitInfo.return);
					room[curExitInfo.exit.dest.room].exits.splice(returnIndex,1);

					curExitInfo.return = null;
					curExitInfo.hasReturn = false;
				}

				curExitInfo.linkState = LinkState.OneWayOriginal;
			}
			else if (curExitInfo.linkState == LinkState.OneWayOriginal) {
				// -- swap the exit & entrance --
				swapExitAndEntrance();

				curExitInfo.linkState = LinkState.OneWaySwapped;
			}
			else if (curExitInfo.linkState == LinkState.OneWaySwapped) {
				// -- create a return exit --
				swapExitAndEntrance(); // swap first

				var newReturn = {
					x : curExitInfo.exit.dest.x,
					y : curExitInfo.exit.dest.y,
					dest : {
						room : curExitInfo.parentRoom,
						x : curExitInfo.exit.x,
						y : curExitInfo.exit.y
					}
				}
				room[curExitInfo.exit.dest.room].exits.push( newReturn );

				curExitInfo.return = newReturn;
				curExitInfo.hasReturn = true;

				curExitInfo.linkState = LinkState.TwoWay;
			}

			refreshGameData();
			RenderExits();
		}
	}

	function UpdateExitDirectionUI() {
		//hacky globals again
		if (curExitInfo != null) {
			if (curExitInfo.linkState == LinkState.TwoWay) {
				document.getElementById("exitDirectionBackIcon").style.visibility = "visible";
				document.getElementById("exitDirectionForwardIcon").style.visibility = "visible";
			}
			else if (curExitInfo.linkState == LinkState.OneWayOriginal) {
				document.getElementById("exitDirectionBackIcon").style.visibility = "hidden";
				document.getElementById("exitDirectionForwardIcon").style.visibility = "visible";
			}
			else if (curExitInfo.linkState == LinkState.OneWaySwapped) {
				document.getElementById("exitDirectionBackIcon").style.visibility = "visible";
				document.getElementById("exitDirectionForwardIcon").style.visibility = "hidden";
			}
		}
	}
} // ExitTool

// required if I'm using inheritance?
var ExitType = { // TODO : figure out a name that includes everything
	Exit : 0,
	Ending : 1,
	// TODO : trigger??
};

// TODO if this proves useful.. move into a shared file
function InitObj(obj, parent) {
	Object.assign(obj, parent);
	obj.self = obj;
	obj.base = parent;
}

function EventLocationBase(parentRoom) {
	this.parentRoom = parentRoom;

	this.Draw = function(ctx,x,y,w,selected) {
		ctx.fillStyle = getContrastingColor();
		ctx.globalAlpha = 0.5;
		ctx.fillRect(x * w, y * w, w, w);

		if (selected) {
			ctx.strokeStyle = getContrastingColor();
			ctx.globalAlpha = 1.0;
			ctx.lineWidth = 2.0;
			ctx.strokeRect((x * w) - (w/4), (y * w) - (w/4), w * 1.5, w * 1.5);
		}
	}
}

function ExitLocation(parentRoom, exit, hasReturn, returnExit, linkState) {
	InitObj( this, new EventLocationBase(parentRoom) );

	this.type = ExitType.Exit; // TODO remove

	this.exit = exit;
	this.hasReturn = hasReturn;
	this.return = returnExit; // TODO naming?
	this.linkState = linkState;

	this.Draw = function(ctx,roomId,w,selected) {
		console.log("TEST CHILD");
		// this.base.Draw(ctx, this.exit.x, this.exit.y, w, selected);

		if (this.parentRoom === roomId) {
			this.base.Draw(ctx, this.exit.x, this.exit.y, w, selected);

			if (this.hasReturn) {
				DrawTwoWayExit(ctx, this.exit.x, this.exit.y, w);
			}
			else {
				DrawExit(ctx, this.exit.x, this.exit.y, w);
			}
		}

		if (this.exit.dest.room === roomId) {
			this.base.Draw(ctx, this.exit.dest.x, this.exit.dest.y, w, selected);

			if (this.hasReturn) {
				DrawTwoWayExit(ctx, this.exit.dest.x, this.exit.dest.y, w);
			}
			else {
				DrawEntrance(ctx, this.exit.dest.x, this.exit.dest.y, w);
			}
		}
	}

	function DrawExit(ctx,x,y,w) {
		ctx.fillStyle = getContrastingColor();
		ctx.globalAlpha = 1.0;
		var centerX = (x * w) + (w/2);
		var centerY = (y * w) + (w/2);
		ctx.beginPath();
		ctx.moveTo(centerX, centerY - (w/4));
		ctx.lineTo(centerX + (w/4), centerY + (w/4));
		ctx.lineTo(centerX - (w/4), centerY + (w/4));
		ctx.fill();
	}

	function DrawEntrance(ctx,x,y,w) {
		ctx.strokeStyle = getContrastingColor();
		ctx.lineWidth = 2.0;
		ctx.globalAlpha = 1.0;
		var centerX = (x * w) + (w/2);
		var centerY = (y * w) + (w/2);
		ctx.beginPath();
		ctx.moveTo(centerX, centerY + (w/4));
		ctx.lineTo(centerX + (w/4), centerY - (w/4));
		ctx.lineTo(centerX - (w/4), centerY - (w/4));
		ctx.lineTo(centerX, centerY + (w/4));
		ctx.stroke();
	}

	function DrawTwoWayExit(ctx,x,y,w) {
		ctx.fillStyle = getContrastingColor();
		ctx.strokeStyle = getContrastingColor();
		ctx.lineWidth = 3.0;
		ctx.globalAlpha = 1.0;
		var centerX = (x * w) + (w/2);
		var centerY = (y * w) + (w/2);
		ctx.beginPath();
		ctx.moveTo(centerX, centerY - (w/4));
		ctx.lineTo(centerX + (w/4), centerY - (w * 0.1));
		ctx.lineTo(centerX - (w/4), centerY - (w * 0.1));
		ctx.fill();
		ctx.beginPath();
		ctx.moveTo(centerX, centerY + (w/4));
		ctx.lineTo(centerX + (w/4), centerY + (w * 0.1));
		ctx.lineTo(centerX - (w/4), centerY + (w * 0.1));
		ctx.fill();
		ctx.beginPath();
		ctx.moveTo(centerX, centerY - (w * 0.2));
		ctx.lineTo(centerX, centerY + (w * 0.2));
		ctx.stroke();
	}
}

function EndingLocation(parentRoom, ending) {
	InitObj( this, new EventLocationBase(parentRoom) );

	this.type = ExitType.Ending; // TODO remove

	this.ending = ending;

	this.Draw = function(ctx,roomId,w,selected) {
		if (this.parentRoom === roomId) {
			this.base.Draw(ctx, this.ending.x, this.ending.y, w, selected);
			DrawEnding(ctx, this.ending.x, this.ending.y, w);
		}
	}

	function DrawEnding(ctx,x,y,w) {
		ctx.strokeStyle = getContrastingColor();
		ctx.lineWidth = 2.0;
		ctx.globalAlpha = 1.0;

		ctx.beginPath();
		ctx.moveTo((x * w) + (w * 0.1), (y * w) + (w * 0.1));
		ctx.lineTo((x * w) + (w * 0.9), (y * w) + (w * 0.9));
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo((x * w) + (w * 0.1), (y * w) + (w * 0.9));
		ctx.lineTo((x * w) + (w * 0.9), (y * w) + (w * 0.1));
		ctx.stroke();
	}
}