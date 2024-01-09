// ==UserScript==
// @name         ChatGPT GPT-4 Counters
// @namespace 	 lugia19.com
// @version      1.3.1
// @description  Add counters (and reset time indicators) for GPT-4/Custom GPTs to ChatGPT
// @author       lugia19
// @license		 MIT
// @match        https://chat.openai.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// ==/UserScript==

//If you want to have the next reset time show up on all webpages, simply change the match to be https://*/*

if (window.top !== window.self)
	throw 'Stopping execution of counters in separate thread.'	//This is because chat.openai.com uses multiple threads. This way we avoid hooking multiple times, which causes issues.


let debug_logs = false

let gpt_4_cap = 40
let custom_gpts_cap = 25

let gpt_4_reset_time = 3 * 60 * 60000
let custom_gpts_reset_time = 3 * 60 * 60000
let timer_check_frequency = 60000


let gpt_4_key = "gpt_4"
let custom_gpts_key = "custom_gpts"

let default_timer_bg_color = "rgba(0, 0, 0, 0.5)"
let red_timer_bg_color = "rgba(180, 0, 0, 0.5)"
let default_padding = '10px'



let itemGrid = document.createElement('div');
let reset_counter_constant = -999	//Used to fix a bug where resetting the custom GPTs counter when it was at 1 would make the GPT-4 counter decrease.

Object.assign(itemGrid.style, {
	position: 'fixed',
	right: '70px',
	bottom: '0',
	zIndex: '1000',
	display: 'grid',
	gridTemplateColumns: 'repeat(2, 1fr)',
	gridTemplateRows: 'repeat(2, 1fr)',
	gap: '10px'
});

if (!window.location.toString().includes("chat.openai.com")) {
	itemGrid.style.gridTemplateRows = 'repeat(1, 1fr)'
}

document.body.append(itemGrid);



//Helper functions
function console_log(text) {
	if (debug_logs)
		console.log(text)
}

function getTwoDigits(value) {
	if (value < 10) {
		return `0${value}`
	} else {
		return `${value}`
	}
}
let refresh_path = normalizeSVGPath( "M4.5 2.5C5.05228 2.5 5.5 2.94772 5.5 3.5V5.07196C7.19872 3.47759 9.48483 2.5 12 2.5C17.2467 2.5 21.5 6.75329 21.5 12C21.5 17.2467 17.2467 21.5 12 21.5C7.1307 21.5 3.11828 17.8375 2.565 13.1164C2.50071 12.5679 2.89327 12.0711 3.4418 12.0068C3.99033 11.9425 4.48712 12.3351 4.5514 12.8836C4.98798 16.6089 8.15708 19.5 12 19.5C16.1421 19.5 19.5 16.1421 19.5 12C19.5 7.85786 16.1421 4.5 12 4.5C9.7796 4.5 7.7836 5.46469 6.40954 7H9C9.55228 7 10 7.44772 10 8C10 8.55228 9.55228 9 9 9H4.5C3.96064 9 3.52101 8.57299 3.50073 8.03859C3.49983 8.01771 3.49958 7.99677 3.5 7.9758V3.5C3.5 2.94772 3.94771 2.5 4.5 2.5Z" )
console.log(`Refresh path: ${refresh_path}`)
function normalizeSVGPath(path) {
  path = path.trim();
  path = path.replace(/\s+/g, ' ');  // Remove extra spaces
  path = path.replace(/([A-Za-z])([0-9])/g, '$1$2');  // Remove spaces between commands and numbers
  path = path.replace(/([0-9])([A-Za-z])/g, '$1$2');  // Remove spaces between numbers and commands
  path = path.toUpperCase();  // Make all commands upper-case
  return path;
}

function formatTime(dateString) {
	if (dateString) {
		let date = new Date(dateString)
		const hours = getTwoDigits(date.getHours());
		const mins = getTwoDigits(date.getMinutes());

		return `${hours}:${mins}`;
	} else {
		return ""
	}
}

function isThreeFive() {
	//Check if we're on 3.5...
	let radixItems = document.querySelectorAll('div[id^="radix-:"]');
	for (let item of radixItems) {
		for (let child of item.children) {
			if (child.matches('svg') && child.classList.contains("text-token-text-tertiary")) {
				console.log("Found the arrow. This is the model selector.")
				if (item.textContent === "ChatGPT 3.5") {
					console.log("Is 3.5, bail.")
					return true
				}
			}
		}
	}
	return false
}



//ResetTimer class
class ResetTimer {
	constructor(storageTimeKey, period) {
		this.timeKey = storageTimeKey;
		this.period = period
		this.counter = undefined

		// Create time input box
		this.timeInput = document.createElement('input');
		itemGrid.insertBefore(this.timeInput, itemGrid.firstChild);
		//itemGrid.appendChild(this.timeInput);
		this.timeInput.type = 'time';

		// Specify Style
		Object.assign(this.timeInput.style, {
			backgroundColor: default_timer_bg_color,
			color: 'white',
			border: 'none',
			padding: default_padding,
			zIndex: '9999',
			textAlign: "center"
		});

		// Load the time
		let storedTimeString = GM_getValue(this.timeKey);
		this.timeInput.value = formatTime(storedTimeString);

		// Add Event Listener
		this.timeInput.addEventListener('change', () => this.handleTimeChange());

		// Add Value Change Listener
		GM_addValueChangeListener(this.timeKey, (key, oldVal, newVal, remote) => this.handleValueChange(key, oldVal, newVal, remote));

		setInterval(() => this.checkTime(), timer_check_frequency);
	}

	setBgColor(color) {
		this.timeInput.style.backgroundColor = color
	}

	handleTimeChange() {
		//Handle the user setting the value
		console.log(`Timeinput change hit: ${this.timeInput.value}`);
		if (this.timeInput.value !== "") {
			const [hours, minutes] = this.timeInput.value.split(':').map(Number);
			const currentTime = new Date();
			let newTime = new Date();

			newTime.setHours(hours, minutes, 0); // We don't care about seconds.

			// Check if the selected time has already passed for today
			if (newTime <= currentTime) {
				//User's chosen has passed, set `newTime` to tomorrow
				console.log("New time has already passed, changing date to tomorrow...")
				newTime.setDate(currentTime.getDate() + 1);
			}

			console.log("Updating time...");
			GM_setValue(this.timeKey, newTime.toISOString());
		} else {
			console.log("timeInput.value was empty, setting stored time to nothing")
			GM_setValue(this.timeKey, null);
		}
	}

	handleValueChange(key, oldValue, newValue, remote) {
		if (oldValue !== newValue) {
			console.log(`Updating time from storage: ${formatTime(newValue)}`);
			this.timeInput.value = formatTime(newValue)
		}
	}

	initializeTimeIfNull() {
		console.log(`initializeTimeIfNull called for ${this.timeKey}`)
		let resetTimeString = GM_getValue(this.timeKey)
		if (!resetTimeString) {
			let newResetTime = new Date((new Date()).getTime() + this.period);
			console.log(`Reset time not currently set, setting it: ${newResetTime}`);
			GM_setValue(this.timeKey, newResetTime.toISOString());
		}
	}

	isTimeSet() {
		let storedResetTimeString = GM_getValue(this.timeKey)
		console.log(`isTimeSet called for ${this.timeKey} with ${storedResetTimeString}`)

		if (storedResetTimeString)
			return true
		return false
	}

	checkTime() {
		const currentTime = new Date();
		let storedResetTimeString = GM_getValue(this.timeKey)
		console.log(`Time check by ${this.timeKey} for ${storedResetTimeString}`)

		if (!storedResetTimeString) {
			//No reset time set. Check if counter is appropriate.
			if (this.counter) {
				if (this.counter.getValue() !== reset_counter_constant)
					this.counter.saveAndUpdate(reset_counter_constant)
			}
			return

		}
		console.log("Reset time was set...")
		let resetTime = new Date(storedResetTimeString);
		if (resetTime) {
			if (currentTime >= resetTime) {
				//If this timer has a counter assigned, reset it
				if (this.counter) {
					console.log("Resetting counter...")
					this.counter.saveAndUpdate(reset_counter_constant)
				}

				console.log("Reset time triggered.")
				//Set stored reset time to null.
				GM_setValue(this.timeKey, null);
				this.timeInput.value = ""
			}
		}
	}
}

const custom_gpts_timer = new ResetTimer(custom_gpts_key + "_timer", custom_gpts_reset_time)
const gpt_4_timer = new ResetTimer(gpt_4_key + "_timer", gpt_4_reset_time)


//If we're _not_ on chat.openai.com, we exit here (I personally keep the timer present on every page, to remind me of the reset time - hence the check).
if (!window.location.toString().includes("chat.openai.com")) {
	throw 'Not adding counters on non-chatGPT sites.'
}

gpt_4_timer.timeInput.style.display = "none"
custom_gpts_timer.timeInput.style.display = "none"


class Counter {
	constructor(key, max_value, label, bg_color, top, callback) {
		this.key = key;
		this.max_value = max_value
		this.label = label;
		this.bg_color = bg_color;
		this.top = top;
		this.callback = callback;
		this.initElements();
		GM_addValueChangeListener(this.key, this.valueListener.bind(this));
	}

	//Listen for storage changes
	valueListener(key, oldValue, newValue, remote) {
		if (oldValue !== newValue)
			this.saveAndUpdate(parseInt(newValue));
	}

	// Function to save counter to localStorage and update display
	saveAndUpdate(value) {
		//Check that the value is valid...
		console.log(`saveandupdate ${this.key} value check... ${value}`)
		if (value < 0 && value !== reset_counter_constant)
			value -= reset_counter_constant

		// Call the callback if it exists
		console.log(`Calling callback for ${this.key}`)
		if (typeof this.callback === 'function') {
			this.callback(value);
		}
		console.log(`Done calling callback for ${this.key}`)
		GM_setValue(this.key, value);

		// Update the counter display (we show reset_counter_constant as 0, despite it being -999)
		if (value === reset_counter_constant)
			value = 0

		this.counterText.textContent = `${this.label}: ${value}/${this.max_value}`;
	}

	getValue() {
		let value = parseInt(GM_getValue(this.key));
		if (!value && value !== 0) {
			value = reset_counter_constant
		}
		return value
	}

	createButtons() {
		this.buttonContainer = document.createElement('div');
		Object.assign(this.buttonContainer.style, {
			justifyContent: 'center',
			gap: '5px',
			display: 'none'	//Hide buttons initially
		});

		['+', '-', 'Reset'].forEach(text => {
			const button = document.createElement('button');
			button.textContent = text;
			button.onclick = () => {
				let current_value = parseInt(GM_getValue(this.key));
				if (!current_value && current_value !== 0) {
					current_value = reset_counter_constant
				}
				console.log(`Button with text ${text} clicked. Current value of counter: ${current_value}`)
				if (current_value === reset_counter_constant) {
					if (text === "+")
						current_value = 1
				} else {
					if (text === '+') current_value += 1;
					else if (text === '-') current_value -= 1;
					else current_value = reset_counter_constant;
				}
				console.log(`New value: ${current_value}`)
				if (current_value < 0 && current_value !== reset_counter_constant) current_value = 0;
				this.saveAndUpdate(current_value);

			};
			button.style.margin = '0 5px';
			button.style.display = 'inline-block';
			this.buttonContainer.appendChild(button);
		});
		this.counterDisplay.appendChild(this.buttonContainer);
	}



	initElements() {
		// Create counter display
		this.counterDisplay = document.createElement('div');
		//itemGrid.appendChild(this.counterDisplay);
		itemGrid.insertBefore(this.counterDisplay, itemGrid.firstChild);
		// Create the counter text
		this.counterText = document.createElement('p');
		this.counterText.style.textAlign = "center"
		this.counterDisplay.appendChild(this.counterText);

		// Customization
		this.counterDisplay.id = `${this.key}-display`;
		// Specify Style
		Object.assign(this.counterDisplay.style, {
			backgroundColor: this.bg_color,
			color: 'white',
			border: 'none',
			padding: default_padding,
			zIndex: '1000',
			display: 'grid', // Changed from 'flex' to 'grid'
			gridTemplateRows: 'auto 1fr', // The counterText will take up the space it needs, and the buttons will take the rest
			alignItems: 'center',
			justifyContent: "center",
			justifyItems: "center"
		});

		this.createButtons()

		// Load counter from localStorage or set to reset_counter_constant if not present
		let current_value = parseInt(GM_getValue(this.key));
		if (!current_value && current_value !== 0) {
			current_value = reset_counter_constant
		}
		this.saveAndUpdate(current_value);
	}
}

// Create counters
let custom_gpts_counter = new Counter(custom_gpts_key + "_counter", custom_gpts_cap, "Custom GPTs", 'rgba(70, 130, 180, 0.5)', '100px', undefined);
custom_gpts_timer.counter = custom_gpts_counter

if (!custom_gpts_timer.isTimeSet())
	custom_gpts_counter.saveAndUpdate(0)

let gpt_4_counter = new Counter(gpt_4_key + "_counter", gpt_4_cap, "GPT-4", 'rgba(119, 54, 135, 0.5)', '50px', undefined);
gpt_4_timer.counter = gpt_4_counter
if (!gpt_4_timer.isTimeSet())
	gpt_4_counter.saveAndUpdate(0)

//Set the timer colors depending on the counter values
function setTimerColors() {
	let gpt_4_value = gpt_4_counter.getValue()
	let custom_gpt_value = custom_gpts_counter.getValue()
	let gpt_4_max = gpt_4_counter.max_value
	let custom_gpt_max = custom_gpts_counter.max_value

	if (gpt_4_value >= gpt_4_max) {
		gpt_4_timer.setBgColor(red_timer_bg_color)
		custom_gpts_timer.setBgColor(red_timer_bg_color)
	} else if (custom_gpt_value >= custom_gpt_max) {
		gpt_4_timer.setBgColor(default_timer_bg_color)
		custom_gpts_timer.setBgColor(red_timer_bg_color)
	} else {
		gpt_4_timer.setBgColor(default_timer_bg_color)
		custom_gpts_timer.setBgColor(default_timer_bg_color)
	}
}

//Set colors at timer creation.
setTimerColors()

// Function to be called in saveAndUpdate for the GPT-4 counter
const gpt4CounterCallback = (value) => {
	if (value > 0)
		gpt_4_timer.initializeTimeIfNull()
	setTimerColors()
};

// Function to be called in saveAndUpdate for Counter 2
const customGPTSCounterCallback = (value) => {
	if (value > 0)
		custom_gpts_timer.initializeTimeIfNull()

	let old_value = parseInt(GM_getValue(custom_gpts_key + "_counter"));
	if (!old_value && old_value !== 0) {
		old_value = reset_counter_constant
	}

	//This is all pretty convoluted, I know.
	console.log(`value: ${value}`)
	console.log(`old_value: ${old_value}`)
	if (value !== reset_counter_constant) {
		let diff = value - old_value
		console.log(`diff: ${diff}`)
		if (-1 <= diff && diff <= 1 && diff !== 0 && value !== reset_counter_constant) {
			console.log("Updating counter1 from counter2 change...");
			let new_value = gpt_4_counter.getValue() + diff
			if (new_value < 0)
				new_value = 0
			console.log(`New value: ${new_value}`)
			// Use global counter1 object for calling the instance method
			gpt_4_counter.saveAndUpdate(new_value);
		} else if (old_value === reset_counter_constant && value > 0 && diff !== 0) {
			console.log("Updating gpt-4 counter due to custom coming out of reset...")
			if (gpt_4_counter.getValue() !== reset_counter_constant) {
				gpt_4_counter.saveAndUpdate(gpt_4_counter.getValue() + 1)
			} else {
				gpt_4_counter.saveAndUpdate(1)
			}

		}
	}


	setTimerColors()
};

gpt_4_counter.callback = gpt4CounterCallback
custom_gpts_counter.callback = customGPTSCounterCallback

gpt_4_counter.counterDisplay.style.transform = 'translateY(100%)';
custom_gpts_counter.counterDisplay.style.transform = 'translateY(100%)';

//Set callbacks to show/hide counter buttons
itemGrid.addEventListener('mouseenter', () => {
	gpt_4_counter.buttonContainer.style.display = ""
	custom_gpts_counter.buttonContainer.style.display = ""
	gpt_4_timer.timeInput.style.display = ""
	custom_gpts_timer.timeInput.style.display = ""
	gpt_4_counter.counterDisplay.style.transform = 'translateY(0)';
	custom_gpts_counter.counterDisplay.style.transform = 'translateY(0)';
});

itemGrid.addEventListener('mouseleave', () => {
	gpt_4_counter.buttonContainer.style.display = "none"
	custom_gpts_counter.buttonContainer.style.display = "none"
	gpt_4_timer.timeInput.style.display = "none"
	custom_gpts_timer.timeInput.style.display = "none"
	gpt_4_counter.counterDisplay.style.transform = 'translateY(100%)';
	custom_gpts_counter.counterDisplay.style.transform = 'translateY(100%)';
});

//Automatically update counters via event delegation/bubbling
console.log("Adding event listeners...")

//keyup event (for sending messages by hitting enter)
function handleKeyup(event) {
	// Check if the event's target is the #prompt-textarea
	if (event.target.matches('#prompt-textarea') && event.key === 'Enter' && !event.shiftKey) {
		console.log("Enter pressed in textarea, without shift.");
		if (isThreeFive())
			return
		console.log("Increasing counter.")
		let is_custom = window.location.toString().includes("https://chat.openai.com/g/"); // Is custom GPT?
		let counter = is_custom ? custom_gpts_counter : gpt_4_counter;
		counter.saveAndUpdate(counter.getValue() + 1);
	}
}

//Helper functions to traverse DOM...
function get_parent_message(element) {
	console.log(`Getting parent message of:`, element)
	let parent_message = element
	while (parent_message) {
		console.log("Searching for parent message...")
		if (parent_message.classList.contains("text-token-text-primary")) {
			console.log(`Found parent message`, parent_message)
			return parent_message
		}
		parent_message = parent_message.parentElement

		console.log(`Iterating, currently on`, parent_message)
	}
	return undefined
}

function is_message_assistant(message) {
	console.log(`Checking if message is assistant for`, message)
	let isAssistant = undefined
	if (!message)
		return undefined

	//Look for the first element with multiple children.
	while (message.childElementCount === 1) {
		message = message.lastChild
	}
	console.log("Iterating over children...")
	for (let child of message.children) {
		console.log(child)
		if (child.classList.contains("w-full")) {
			isAssistant = child.classList.contains("agent-turn")
			break
		}
	}
	return isAssistant
}

//Clicker event, for all the buttons.
function handleClick(event) {
	console.log(`Click event from:`, event.target)

	if (isThreeFive())	//We just exit immediately.
		return

	//Get first button in tree.
	let target_btn = event.target
	while (target_btn && !target_btn.matches("button")) {
		target_btn = target_btn.parentElement
		if(target_btn && !("matches" in target_btn)) {
        	target_btn = undefined;
    	}
	}


	let target_path = event.target
	while (target_path && !target_path.matches("path")) {
		target_path = target_path.lastChild
		if(target_path && !("matches" in target_path)) {
        	target_path = undefined;
    	}
	}

	console.log(`Found target_btn:`, target_btn)
	console.log(`Found target_path:`, target_path)

	let should_increase = false

	if (target_btn) {	//Only continue if we found a button parent of event.target
		//Refresh button
		if (target_btn.matches('button.rounded-md')) {
			if (target_path) {
				console.log("Checking the path...")
				let path_string = normalizeSVGPath(target_path.getAttribute("d"))
				if (path_string === refresh_path) {
					console.log("Path matches refresh path. Is refresh.")
					should_increase = true
				}
			}


			/*
			let parent_msg = get_parent_message(target_btn)
			let isAssistant = is_message_assistant(parent_msg)
			console.log(`parent_msg:`, parent_msg)
			console.log(`isAssistant:`, isAssistant)

			if (isAssistant) {
				console.log("Is assistant button.")
				if (target_btn === target_btn.parentElement.lastChild) {
					console.log("Is last button.")
					if (target_btn.parentElement.classList.contains("text-gray-400")) {
						should_increase = true
					} else {
						console.log("Is dislike - ignore.")
					}
				} else {
					console.log("Is not last button - ignore.")
				}
			} else {
				if (parent_msg) {
					console.log("Is not assistant button - ignore.")
				} else if (target_path) {
					console.log("Could not find parent msg - check the path.")
					let path_string = normalizeSVGPath(target_path.getAttribute("d"))
					if (path_string === refresh_path) {
						console.log("Path matches refresh path. Is refresh.")
						should_increase = true
					}
				} else {
					console.log("No parent msg and no target path. What?")
				}

			}*/
		}

		//Send button
		if (target_btn.getAttribute("data-testid") === "send-button") {
			console.log("Is send button.")
			should_increase = true
		}

		//Save & Submit button
		if (target_btn.textContent && (target_btn.textContent === "Save & Submit" || target_btn.textContent === "Regenerate")) {
			console.log("Is save & submit or regenerate.")
			should_increase = true
		}

		if (target_btn.classList.contains("text-left") && target_btn.classList.contains("rounded-xl")) {
			console.log("Is example chat")
			should_increase = true
		}
	}

	if (should_increase) {
		console.log("Increasing counter...")
		let is_custom = window.location.toString().includes("https://chat.openai.com/g/")
		let counter = is_custom ? custom_gpts_counter : gpt_4_counter;
		counter.saveAndUpdate(counter.getValue() + 1)
	}
}

//Add event listeners to document
document.addEventListener('keyup', handleKeyup);
document.addEventListener('click', handleClick);
