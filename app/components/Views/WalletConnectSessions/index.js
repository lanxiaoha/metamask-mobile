import React, { PureComponent } from 'react';
import { Alert, ScrollView, SafeAreaView, StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { colors, fontStyles } from '../../../styles/common';
import { strings } from '../../../../locales/i18n';
import { getNavigationOptionsTitle } from '../../UI/Navbar';
import WebsiteIcon from '../../UI/WebsiteIcon';
import AsyncStorage from '@react-native-community/async-storage';
import ActionSheet from 'react-native-actionsheet';
import WalletConnect from '../../../core/WalletConnect';
import Logger from '../../../util/Logger';
import AndroidBackHandler from '../AndroidBackHandler';
import PropTypes from 'prop-types';

const styles = StyleSheet.create({
	wrapper: {
		backgroundColor: colors.white,
		flex: 1
	},
	scrollviewContent: {
		paddingTop: 20
	},
	websiteIcon: {
		width: 44,
		height: 44
	},
	row: {
		flexDirection: 'row',
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderBottomColor: colors.grey000,
		borderBottomWidth: 1
	},
	info: {
		marginLeft: 20,
		flex: 1
	},
	name: {
		...fontStyles.bold,
		fontSize: 16,
		marginBottom: 10
	},
	desc: {
		marginBottom: 10,
		...fontStyles.normal,
		fontSize: 12
	},
	url: {
		marginBottom: 10,
		...fontStyles.normal,
		fontSize: 12,
		color: colors.fontSecondary
	},
	emptyWrapper: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center'
	},
	emptyText: {
		...fontStyles.normal,
		fontSize: 16
	}
});

/**
 * View that displays all the active WalletConnect Sessions
 */
export default class WalletConnectSessions extends PureComponent {
	static navigationOptions = ({ navigation }) =>
		getNavigationOptionsTitle(strings(`experimental_settings.wallet_connect_dapps`), navigation);

	static propTypes = {
		/**
		/* navigation object required to push new views
		*/
		navigation: PropTypes.object
	};

	state = {
		sessions: []
	};

	actionSheet = null;

	sessionToRemove = null;

	componentDidMount() {
		this.loadSessions();
	}

	loadSessions = async () => {
		let sessions = [];
		const sessionData = await AsyncStorage.getItem('@MetaMask:walletconnectSessions');
		if (sessionData) {
			sessions = JSON.parse(sessionData);
		}
		this.setState({ ready: true, sessions });
	};

	renderDesc = meta => {
		const { description } = meta;
		if (description) {
			return <Text style={styles.desc}>{meta.description}</Text>;
		}
		return null;
	};

	onLongPress = session => {
		this.sessionToRemove = session;
		this.actionSheet.show();
	};

	createActionSheetRef = ref => {
		this.actionSheet = ref;
	};

	onActionSheetPress = index => (index === 0 ? this.killSession() : null);

	killSession = async () => {
		try {
			await WalletConnect.killSession(this.sessionToRemove.peerId);
			Alert.alert(
				strings('walletconnect_sessions.session_ended_title'),
				strings('walletconnect_sessions.session_ended_desc')
			);
			this.loadSessions();
		} catch (e) {
			Logger.error('WC: Failed to kill session', e);
		}
	};

	renderSessions = () => {
		const { sessions } = this.state;
		return sessions.map(session => (
			<TouchableOpacity
				// eslint-disable-next-line react/jsx-no-bind
				onLongPress={() => this.onLongPress(session)}
				key={`session_${session.peerId}`}
				style={styles.row}
			>
				<WebsiteIcon url={session.peerMeta.url} style={styles.websiteIcon} />
				<View style={styles.info}>
					<Text style={styles.name}>{session.peerMeta.name}</Text>
					<Text style={styles.url}>{session.peerId}</Text>
					<Text style={styles.url}>{session.peerMeta.url}</Text>
					{this.renderDesc(session.peerMeta)}
				</View>
			</TouchableOpacity>
		));
	};

	renderEmpty = () => (
		<View style={styles.emptyWrapper}>
			<Text style={styles.emptyText}>{strings('walletconnect_sessions.no_active_sessions')}</Text>
		</View>
	);

	render = () => {
		const { ready, sessions } = this.state;
		if (!ready) return null;

		return (
			<SafeAreaView style={styles.wrapper} testID={'wallet-connect-sessions-screen'}>
				<ScrollView style={styles.wrapper} contentContainerStyle={styles.scrollviewContent}>
					{sessions.length ? this.renderSessions() : this.renderEmpty()}
				</ScrollView>
				<ActionSheet
					ref={this.createActionSheetRef}
					title={strings('walletconnect_sessions.end_session_title')}
					options={[strings('walletconnect_sessions.end'), strings('walletconnect_sessions.cancel')]}
					cancelButtonIndex={1}
					destructiveButtonIndex={0}
					onPress={this.onActionSheetPress}
				/>
				{Platform.OS === 'android' && <AndroidBackHandler navigation={this.props.navigation} />}
			</SafeAreaView>
		);
	};
}
