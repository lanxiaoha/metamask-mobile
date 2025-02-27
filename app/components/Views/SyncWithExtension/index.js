import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { Platform, Alert, ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-community/async-storage';
import { connect } from 'react-redux';
import { passwordSet, seedphraseBackedUp } from '../../../actions/user';
import { setLockTime } from '../../../actions/settings';
import SecureKeychain from '../../../core/SecureKeychain';
import { colors, fontStyles } from '../../../styles/common';
import Logger from '../../../util/Logger';
import { strings } from '../../../../locales/i18n';
import StyledButton from '../../UI/StyledButton';
import { getNavigationOptionsTitle } from '../../UI/Navbar';
import Engine from '../../../core/Engine';
import AppConstants from '../../../core/AppConstants';
import PubNubWrapper from '../../../util/syncWithExtension';
import AndroidBackHandler from '../AndroidBackHandler';

const styles = StyleSheet.create({
	mainWrapper: {
		backgroundColor: colors.white,
		flex: 1
	},
	wrapper: {
		flex: 1,
		padding: 20
	},
	title: {
		fontSize: 32,
		marginTop: 20,
		marginBottom: 10,
		color: colors.fontPrimary,
		justifyContent: 'center',
		textAlign: 'center',
		...fontStyles.bold
	},
	text: {
		marginTop: 20,
		fontSize: 16,
		textAlign: 'center',
		color: colors.fontPrimary,
		...fontStyles.normal
	},
	loadingText: {
		marginTop: 20,
		fontSize: 14,
		textAlign: 'center',
		color: colors.fontPrimary,
		...fontStyles.normal
	},
	button: {
		marginTop: 40
	}
});

const PUB_KEY = process.env['MM_PUBNUB_PUB_KEY']; // eslint-disable-line dot-notation

/**
 *
 * View that initiates the sync process with
 * the MetaMask extension
 */
class SyncWithExtension extends PureComponent {
	static propTypes = {
		/**
		 * The navigator object
		 */
		navigation: PropTypes.object,
		/**
		 * The action to update the password set flag
		 * in the redux store
		 */
		passwordHasBeenSet: PropTypes.func,
		/**
		 * The action to update the seedphrase backed up flag
		 * in the redux store
		 */
		seedphraseBackedUp: PropTypes.func,
		/**
		 * Boolean that determines if the user has set a password before
		 */
		passwordSet: PropTypes.bool,
		/**
		 * The action to update the locktime
		 * in the redux store
		 */
		setLockTime: PropTypes.func,
		/**
		 * Selected address
		 */
		selectedAddress: PropTypes.string
	};

	seedwords = null;
	channelName = null;
	incomingDataStr = '';
	dataToSync = null;
	mounted = false;
	complete = false;

	state = {
		loading: false
	};

	static navigationOptions = ({ navigation }) =>
		getNavigationOptionsTitle(strings('sync_with_extension.short_title'), navigation);

	componentDidMount() {
		this.mounted = true;
	}

	componentWillUnmount() {
		this.mounted = false;
		this.pubnubWrapper && this.pubnubWrapper.disconnectWebsockets();
	}

	scanCode = () => {
		if (!PUB_KEY) {
			// Dev message
			Alert.alert(
				'This feature has been disabled',
				`Because you did not set the .js.env file. Look at .js.env.example for more information`
			);
			return false;
		}

		if (this.props.navigation.getParam('existingUser', false)) {
			Alert.alert(
				strings('sync_with_extension.warning_title'),
				strings('sync_with_extension.warning_message'),
				[
					{
						text: strings('sync_with_extension.warning_cancel_button'),
						onPress: () => false,
						style: 'cancel'
					},
					{ text: strings('sync_with_extension.warning_ok_button'), onPress: () => this.showQrCode() }
				],
				{ cancelable: false }
			);
		} else {
			this.showQrCode();
		}
	};

	startSync = async firstAttempt => {
		try {
			this.initWebsockets();
			await this.pubnubWrapper.startSync();
			return true;
		} catch (e) {
			if (!firstAttempt) {
				this.props.navigation.goBack();
				if (e.toString() === 'sync-timeout') {
					Alert.alert(
						strings('sync_with_extension.outdated_qr_code'),
						strings('sync_with_extension.outdated_qr_code_desc')
					);
				} else {
					Alert.alert(
						strings('sync_with_extension.something_wrong'),
						strings('sync_with_extension.something_wrong_desc')
					);
				}
			}
			Logger.log('Sync::startSync', firstAttempt);
			Logger.log('Sync::startSync', e.toString());
			Logger.error('Sync::startSync', e);
			return false;
		}
	};

	showQrCode = () => {
		this.props.navigation.push('QRScanner', {
			onStartScan: async data => {
				if (data.content && data.content.search('metamask-sync:') !== -1) {
					const [channelName, cipherKey] = data.content.replace('metamask-sync:', '').split('|@|');
					this.pubnubWrapper = new PubNubWrapper(channelName, cipherKey);
					await this.pubnubWrapper.establishConnection(this.props.selectedAddress);
				} else {
					Alert.alert(
						strings('sync_with_extension.invalid_qr_code'),
						strings('sync_with_extension.invalid_qr_code_desc')
					);
				}
			},
			onScanSuccess: async data => {
				if (data.content && data.content.search('metamask-sync:') !== -1) {
					(await this.startSync(true)) || (await this.startSync(false));
				} else {
					Alert.alert(
						strings('sync_with_extension.invalid_qr_code'),
						strings('sync_with_extension.invalid_qr_code_desc')
					);
				}
			}
		});
	};

	initWebsockets() {
		this.loading = true;
		this.mounted && this.setState({ loading: true });

		this.pubnubWrapper.addMessageListener(
			() => {
				Alert.alert(strings('sync_with_extension.error_title'), strings('sync_with_extension.error_message'));
				this.loading = false;
				this.setState({ loading: false });
				return false;
			},
			data => {
				const { pwd, seed } = data.udata;
				this.password = pwd;
				this.seedWords = seed;
				delete data.udata;
				this.dataToSync = { ...data };
				this.pubnubWrapper.endSync(() => this.disconnect());
			}
		);
		this.pubnubWrapper.subscribe();
	}

	async disconnect() {
		let password;
		try {
			// If there's a password set, let's keep it
			if (this.props.passwordSet) {
				// This could also come from the previous step if it's a first time user
				const credentials = await SecureKeychain.getGenericPassword();
				if (credentials) {
					password = credentials.password;
				} else {
					password = this.password;
				}
				// Otherwise use the password from the extension
			} else {
				password = this.password;
			}
		} catch (e) {
			password = this.password;
		}

		if (password === this.password) {
			const biometryType = await SecureKeychain.getSupportedBiometryType();
			if (biometryType) {
				this.setState({ biometryType, biometryChoice: true });
			}

			const authOptions = {
				accessControl: this.state.biometryChoice
					? SecureKeychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE
					: SecureKeychain.ACCESS_CONTROL.DEVICE_PASSCODE
			};

			await SecureKeychain.setGenericPassword('metamask-user', password, authOptions);

			if (!this.state.biometryChoice) {
				await AsyncStorage.removeItem('@MetaMask:biometryChoice');
			} else {
				// If the user enables biometrics, we're trying to read the password
				// immediately so we get the permission prompt
				try {
					if (Platform.OS === 'ios') {
						await SecureKeychain.getGenericPassword();
					}
					await AsyncStorage.setItem('@MetaMask:biometryChoice', this.state.biometryType);
				} catch (e) {
					Logger.error('User cancelled biometrics permission', e);
				}
			}
		}

		try {
			await Engine.sync({ ...this.dataToSync, seed: this.seedWords, pass: password });
			await AsyncStorage.setItem('@MetaMask:existingUser', 'true');
			this.props.passwordHasBeenSet();
			this.props.setLockTime(AppConstants.DEFAULT_LOCK_TIMEOUT);
			this.props.seedphraseBackedUp();
			this.done = true;
			this.dataToSync = null;
			this.props.navigation.push('SyncWithExtensionSuccess');
		} catch (e) {
			Logger.error('Sync::disconnect', e);
			Alert.alert(strings('sync_with_extension.error_title'), strings('sync_with_extension.error_message'));
			this.setState({ loading: false });
			this.props.navigation.goBack();
		}
	}

	goBack = () => {
		this.props.navigation.navigate('HomeNav');
	};

	renderLoader() {
		return (
			<View style={styles.wrapper} testID={'sync-with-extension-screen'}>
				<View style={styles.loader}>
					<ActivityIndicator size="small" />
					<Text style={styles.loadingText}>{strings('sync_with_extension.please_wait')}</Text>
				</View>
			</View>
		);
	}

	renderInitialView() {
		return (
			<View>
				<Text style={styles.text}>{strings('sync_with_extension.label')}</Text>
				<StyledButton type="blue" onPress={this.scanCode} containerStyle={styles.button}>
					{strings('sync_with_extension.button_continue')}
				</StyledButton>
			</View>
		);
	}

	renderContent() {
		if (this.state.loading) return this.renderLoader();
		return this.renderInitialView();
	}

	render = () => (
		<SafeAreaView style={styles.mainWrapper}>
			<View style={styles.wrapper} testID={'sync-with-extension-screen'}>
				<Text style={styles.title}>{strings('sync_with_extension.title')}</Text>
				{this.renderContent()}
			</View>
			{Platform.OS === 'android' && <AndroidBackHandler navigation={this.props.navigation} />}
		</SafeAreaView>
	);
}

const mapStateToProps = state => ({
	selectedAddress: state.engine.backgroundState.PreferencesController.selectedAddress,
	accounts: state.engine.backgroundState.AccountTrackerController.accounts,
	passwordSet: state.user.passwordSet
});

const mapDispatchToProps = dispatch => ({
	setLockTime: time => dispatch(setLockTime(time)),
	passwordHasBeenSet: () => dispatch(passwordSet()),
	seedphraseBackedUp: () => dispatch(seedphraseBackedUp())
});

export default connect(
	mapStateToProps,
	mapDispatchToProps
)(SyncWithExtension);
